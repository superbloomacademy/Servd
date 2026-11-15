// Background jobs. Locally the server runs them every 30 s; on Vercel they run when screens check for live news
// (maybeRunJobs, at most every 20 s per server instance) and from /api/cron/jobs.
import { and, eq, inArray, isNotNull, lt, lte } from 'drizzle-orm';
import { db, schema } from '@/db';
import { broadcastOrder, releaseKots } from './orders';

export async function runJobs() {
  // 1. Auto-cancel pay-first orders that were never paid (not even claimed) in time.
  const waiting = await db().select({ o: schema.orders, v: schema.venues }).from(schema.orders)
    .innerJoin(schema.venues, eq(schema.orders.venueId, schema.venues.id))
    .where(and(eq(schema.orders.status, 'awaiting_payment'), eq(schema.orders.payStatus, 'unpaid')));
  for (const { o, v } of waiting) {
    if (Date.now() - o.createdAt.getTime() > v.settings.unpaidCancelMin * 60e3) {
      await db().update(schema.orders).set({
        status: 'cancelled', rejectReason: `Not paid within ${v.settings.unpaidCancelMin} minutes`,
        timeline: [...o.timeline, { status: 'cancelled', at: new Date().toISOString(), by: 'system' }],
      }).where(eq(schema.orders.id, o.id));
      await broadcastOrder(o.id);
    }
  }

  // 2. Interval orders: send to the kitchen when their release time arrives.
  const due = await db().selectDistinct({ id: schema.orders.id }).from(schema.orders)
    .innerJoin(schema.kots, eq(schema.kots.orderId, schema.orders.id))
    .where(and(eq(schema.kots.status, 'held'), isNotNull(schema.orders.releaseAt), lte(schema.orders.releaseAt, new Date()),
      inArray(schema.orders.payStatus, ['paid', 'on_bill'])));
  for (const { id } of due) { await releaseKots(id); await broadcastOrder(id, 'new'); }

  // 3. Live events are only needed for a few minutes.
  await db().delete(schema.rtEvents).where(lt(schema.rtEvents.at, new Date(Date.now() - 15 * 60e3)));
}

const g = globalThis as unknown as { __servdJobsAt?: number; __servdJobsRun?: Promise<void> | null };
/** Run the jobs if this server instance hasn't run them in the last 20 seconds. */
export async function maybeRunJobs() {
  if (g.__servdJobsRun) return g.__servdJobsRun;
  if (Date.now() - (g.__servdJobsAt || 0) < 20_000) return;
  g.__servdJobsAt = Date.now();
  g.__servdJobsRun = runJobs().catch(e => console.error('[jobs]', e)).finally(() => { g.__servdJobsRun = null; });
  return g.__servdJobsRun;
}

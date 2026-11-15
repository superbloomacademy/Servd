import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { ApiError, bad, body, route } from '@/lib/api';
import { requireCustomer } from '@/lib/auth';
import { emit } from '@/lib/realtime';

// "Call waiter" / "Ask for water" from the table.
export const POST = route(async req => {
  const c = await requireCustomer();
  const b = await body<{ visitId: string; kind: 'waiter' | 'water' }>(req);
  if (!['waiter', 'water'].includes(b.kind)) throw bad('Unknown request');
  const v = /^[0-9a-f-]{36}$/.test(b.visitId || '') ? (await db().select().from(schema.visits).where(eq(schema.visits.id, b.visitId)))[0] : null;
  if (!v || v.expiresAt < new Date()) throw new ApiError(400, 'Scan the QR code on your table again.', 'RESCAN');
  if (v.customerId && v.customerId !== c.id) await db().update(schema.visits).set({ customerId: c.id }).where(eq(schema.visits.id, v.id));
  const [r] = await db().insert(schema.serviceRequests).values({ venueId: v.venueId, spotId: v.spotId, tableSessionId: v.tableSessionId, kind: b.kind }).returning();
  emit(`venue:${v.venueId}`, 'request', { id: r.id });
  return { ok: true };
});

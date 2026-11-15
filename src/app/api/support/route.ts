import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { bad, body, route } from '@/lib/api';
import { requireCustomer } from '@/lib/auth';
import { emit } from '@/lib/realtime';

export const GET = route(async () => {
  const c = await requireCustomer();
  const t = await db().select().from(schema.supportTickets).where(eq(schema.supportTickets.customerId, c.id)).orderBy(desc(schema.supportTickets.createdAt)).limit(30);
  return { tickets: t };
});

export const POST = route(async req => {
  const c = await requireCustomer();
  const b = await body<{ orderId?: string; topic: string; message: string }>(req);
  const topic = String(b.topic || '').slice(0, 60), message = String(b.message || '').trim().slice(0, 1000);
  if (!topic || message.length < 5) throw bad('Tell us a little more about the problem.');
  let venueId: string | null = null, orderId: string | null = null;
  if (b.orderId && /^[0-9a-f-]{36}$/.test(b.orderId)) {
    const o = (await db().select().from(schema.orders).where(and(eq(schema.orders.id, b.orderId), eq(schema.orders.customerId, c.id))))[0];
    if (o) { venueId = o.venueId; orderId = o.id; }
  }
  const [t] = await db().insert(schema.supportTickets).values({ customerId: c.id, venueId, orderId, topic, message }).returning();
  if (venueId) emit(`venue:${venueId}`, 'support', { id: t.id });
  return { ticket: t };
});

import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { bad, body, notFound, route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { CAN } from '@/lib/roles';

export const GET = route<{ venueId: string }>(async (_req, { venueId }) => {
  await requireVenueAccess(venueId, CAN.reports);
  const rows = await db().select({ t: schema.supportTickets, c: schema.customers, o: schema.orders }).from(schema.supportTickets)
    .innerJoin(schema.customers, eq(schema.supportTickets.customerId, schema.customers.id))
    .leftJoin(schema.orders, eq(schema.supportTickets.orderId, schema.orders.id))
    .where(eq(schema.supportTickets.venueId, venueId)).orderBy(desc(schema.supportTickets.createdAt)).limit(100);
  return { tickets: rows.map(r => ({ ...r.t, customerName: r.c.name, customerPhone: r.c.phone, kotNo: r.o?.kotNo ?? null })) };
});

// Reply to a ticket and mark it resolved.
export const POST = route<{ venueId: string }>(async (req, { venueId }) => {
  await requireVenueAccess(venueId, CAN.reports);
  const b = await body<{ id: string; reply: string }>(req);
  if (!String(b.reply || '').trim()) throw bad('Write a reply');
  const [t] = await db().update(schema.supportTickets).set({ reply: String(b.reply).slice(0, 1000), status: 'resolved' })
    .where(and(eq(schema.supportTickets.id, String(b.id)), eq(schema.supportTickets.venueId, venueId))).returning();
  if (!t) throw notFound('Ticket not found');
  return { ticket: t };
});

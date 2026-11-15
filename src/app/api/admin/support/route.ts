import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { bad, body, notFound, route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { audit } from '@/lib/audit';

// Every customer help request across all venues, so we can step in when a venue doesn't reply.
export const GET = route(async () => {
  await requireStaff(['super_admin']);
  const rows = await db().select({ t: schema.supportTickets, c: schema.customers, venue: schema.venues, vendor: schema.vendors, o: schema.orders })
    .from(schema.supportTickets)
    .innerJoin(schema.customers, eq(schema.supportTickets.customerId, schema.customers.id))
    .leftJoin(schema.venues, eq(schema.supportTickets.venueId, schema.venues.id))
    .leftJoin(schema.vendors, eq(schema.venues.vendorId, schema.vendors.id))
    .leftJoin(schema.orders, eq(schema.supportTickets.orderId, schema.orders.id))
    .orderBy(desc(schema.supportTickets.createdAt)).limit(300);
  return {
    tickets: rows.map(r => ({
      ...r.t, customerName: r.c.name, customerPhone: r.c.phone, customerEmail: r.c.email,
      venueId: r.venue?.id ?? null, venueName: r.venue?.name ?? 'Not about a venue', vendorName: r.vendor?.name ?? '', vendorPhone: r.vendor?.phone ?? null,
      kotNo: r.o?.kotNo ?? null, orderTotal: r.o?.totalPaise ?? null,
    })),
  };
});

// Reply as the platform and mark the request resolved.
export const POST = route(async req => {
  const s = await requireStaff(['super_admin']);
  const b = await body<{ id: string; reply: string }>(req);
  const reply = String(b.reply || '').trim();
  if (!reply) throw bad('Write a reply');
  const [t] = await db().update(schema.supportTickets).set({ reply: `${reply.slice(0, 1000)}\n— Servd support`, status: 'resolved' })
    .where(eq(schema.supportTickets.id, String(b.id))).returning();
  if (!t) throw notFound('Request not found');
  await audit(s, { action: 'support_replied', entity: 'support_ticket', entityId: t.id, venueId: t.venueId, after: { reply } });
  return { ticket: t };
});

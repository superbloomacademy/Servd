import { isSale } from '@/lib/admin';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { CAN } from '@/lib/roles';
import { localParts } from '@/lib/util';

function rangeStart(range: string) {
  const { date } = localParts();
  const today = new Date(`${date}T00:00:00+05:30`).getTime();
  const days = range === '7d' ? 6 : range === '30d' ? 29 : range === 'today' ? 0 : 3650;
  return new Date(today - days * 864e5);
}

// Sales dashboard + settlement: online (UPI to venue) vs cash, commission, best sellers, hours, stations.
export const GET = route<{ venueId: string }>(async (req, { venueId }) => {
  await requireVenueAccess(venueId, CAN.reports);
  const range = new URL(req.url).searchParams.get('range') || 'today';
  const start = rangeStart(range);
  const paid = and(eq(schema.orders.venueId, venueId), gte(schema.orders.createdAt, start), isSale());
  const d = db();
  const [vendorRow] = await d.select({ commissionBps: schema.vendors.commissionBps }).from(schema.venues)
    .innerJoin(schema.vendors, eq(schema.venues.vendorId, schema.vendors.id)).where(eq(schema.venues.id, venueId));

  const [totals] = await d.select({
    orders: sql<number>`count(*)::int`, revenue: sql<number>`coalesce(sum(${schema.orders.totalPaise}),0)::int`,
    discount: sql<number>`coalesce(sum(${schema.orders.discountPaise}),0)::int`, tax: sql<number>`coalesce(sum(${schema.orders.taxPaise}),0)::int`,
    customers: sql<number>`count(distinct ${schema.orders.customerId})::int`,
  }).from(schema.orders).where(paid);

  // By payment mode, from the GST bills (split payments counted in each mode).
  const byMethod = (await d.execute(sql`select p->>'method' as method, count(distinct i.id)::int as orders, sum((p->>'amountPaise')::int)::int as amount
    from invoices i, jsonb_array_elements(i.payments) p where i.venue_id = ${venueId} and i.status = 'issued' and i.issued_at >= ${start} group by 1`)).rows as { method: string; orders: number; amount: number }[];
  const [qr] = await d.select({ amount: sql<number>`coalesce(sum(${schema.orders.totalPaise}),0)::int` }).from(schema.orders).where(and(paid, eq(schema.orders.channel, 'qr')));

  const topItems = await d.select({ name: schema.orderItems.name, qty: sql<number>`sum(${schema.orderItems.qty})::int`, revenue: sql<number>`sum(${schema.orderItems.qty} * ${schema.orderItems.pricePaise})::int` })
    .from(schema.orderItems).innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id)).where(paid)
    .groupBy(schema.orderItems.name).orderBy(sql`2 desc`);

  const byHour = await d.select({ h: sql<number>`extract(hour from ${schema.orders.createdAt} at time zone 'Asia/Kolkata')::int`, orders: sql<number>`count(*)::int`, revenue: sql<number>`sum(${schema.orders.totalPaise})::int` })
    .from(schema.orders).where(paid).groupBy(sql`1`);

  const byDay = await d.select({ day: schema.orders.businessDate, orders: sql<number>`count(*)::int`, revenue: sql<number>`sum(${schema.orders.totalPaise})::int` })
    .from(schema.orders).where(paid).groupBy(schema.orders.businessDate).orderBy(schema.orders.businessDate);

  const prep = await d.select({ station: schema.kots.stationName, avgMin: sql<number>`round(avg(extract(epoch from (${schema.kots.readyAt} - ${schema.kots.createdAt}))/60)::numeric, 1)::float`, n: sql<number>`count(*)::int` })
    .from(schema.kots).where(and(eq(schema.kots.venueId, venueId), gte(schema.kots.createdAt, start), eq(schema.kots.status, 'ready')))
    .groupBy(schema.kots.stationName);

  const repeat = await d.execute(sql`select count(*)::int as n from (
      select customer_id from orders where venue_id = ${venueId} and pay_status = 'paid' group by customer_id having count(*) > 1) x
    where customer_id in (select customer_id from orders where venue_id = ${venueId} and created_at >= ${start} and pay_status = 'paid')`);

  const live = await d.select({ n: sql<number>`count(*)::int` }).from(schema.orders)
    .where(and(eq(schema.orders.venueId, venueId), inArray(schema.orders.status, ['awaiting_payment', 'confirmed', 'preparing', 'ready', 'out'])));
  const tables = await d.select({ n: sql<number>`count(*)::int`, amount: sql<number>`coalesce(sum(${schema.tableSessions.totalPaise}),0)::int` })
    .from(schema.tableSessions).where(and(eq(schema.tableSessions.venueId, venueId), eq(schema.tableSessions.status, 'closed'), gte(schema.tableSessions.closedAt, start)));

  const commission = Math.round(qr.amount * (vendorRow?.commissionBps || 0) / 10000);
  return {
    range, ...totals, aov: totals.orders ? Math.round(totals.revenue / totals.orders) : 0,
    repeatCustomers: (repeat.rows[0] as { n: number })?.n ?? 0, liveOrders: live[0].n,
    byMethod, topItems, byHour: byHour.sort((a, b) => a.h - b.h), byDay, prep,
    settlement: { commissionBps: vendorRow?.commissionBps || 0, commissionPaise: commission, qrSalesPaise: qr.amount, tablesClosed: tables[0].n },
  };
});

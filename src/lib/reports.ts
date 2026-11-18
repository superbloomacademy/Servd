// Day-end (Z) report for one venue and a date range (India dates, inclusive).
// Money = GST bills issued in the range (cancelled bills listed separately); items/channels = real sales (isSale).
import { and, desc, eq, gte, inArray, lt, notInArray, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { isSale } from './admin';
import { bad } from './api';

export function dayRange(from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw bad('Choose a date.');
  const start = new Date(`${from}T00:00:00+05:30`), end = new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 864e5);
  if (end <= start) throw bad('The end date is before the start date.');
  if (end.getTime() - start.getTime() > 92 * 864e5) throw bad('Choose at most 3 months at a time.');
  return { start, end };
}

export async function dayReport(venueId: string, from: string, to: string) {
  const { start, end } = dayRange(from, to);
  const d = db();
  const inv = and(eq(schema.invoices.venueId, venueId), gte(schema.invoices.issuedAt, start), lt(schema.invoices.issuedAt, end));
  const sales = and(eq(schema.orders.venueId, venueId), isSale(), gte(schema.orders.paidAt, start), lt(schema.orders.paidAt, end));

  const [bills] = await d.select({
    bills: sql<number>`count(*)::int`,
    subtotal: sql<number>`coalesce(sum(${schema.invoices.subtotalPaise}),0)::int`,
    discount: sql<number>`coalesce(sum(${schema.invoices.discountPaise}),0)::int`,
    taxable: sql<number>`coalesce(sum(${schema.invoices.taxablePaise}),0)::int`,
    cgst: sql<number>`coalesce(sum(${schema.invoices.cgstPaise}),0)::int`,
    sgst: sql<number>`coalesce(sum(${schema.invoices.sgstPaise}),0)::int`,
    roundOff: sql<number>`coalesce(sum(${schema.invoices.roundOffPaise}),0)::int`,
    total: sql<number>`coalesce(sum(${schema.invoices.totalPaise}),0)::int`,
  }).from(schema.invoices).where(and(inv, eq(schema.invoices.status, 'issued')));
  const [cancelledBills] = await d.select({ n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${schema.invoices.totalPaise}),0)::int` })
    .from(schema.invoices).where(and(inv, eq(schema.invoices.status, 'cancelled')));

  const pay = await d.execute(sql`
    select p->>'method' as method, count(distinct i.id)::int as bills, sum((p->>'amountPaise')::int)::int as amount
    from invoices i, jsonb_array_elements(i.payments) p
    where i.venue_id = ${venueId} and i.status = 'issued' and i.issued_at >= ${start} and i.issued_at < ${end}
    group by 1 order by 3 desc`);

  const channels = await d.select({ channel: schema.orders.channel, fulfilment: schema.orders.fulfilment, orders: sql<number>`count(*)::int`, amount: sql<number>`sum(${schema.orders.totalPaise})::int` })
    .from(schema.orders).where(sales).groupBy(schema.orders.channel, schema.orders.fulfilment).orderBy(sql`4 desc`);

  const items = await d.select({
    category: sql<string>`coalesce(${schema.categories.name}, 'Other')`, name: schema.orderItems.name,
    qty: sql<number>`sum(${schema.orderItems.qty})::int`, amount: sql<number>`sum(${schema.orderItems.qty} * ${schema.orderItems.pricePaise})::int`,
  }).from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .leftJoin(schema.items, eq(schema.orderItems.itemId, schema.items.id))
    .leftJoin(schema.categories, eq(schema.items.categoryId, schema.categories.id))
    .where(sales).groupBy(sql`1`, schema.orderItems.name).orderBy(sql`1`, sql`3 desc`);
  const catMap = new Map<string, { category: string; qty: number; amount: number }>();
  for (const i of items) { const c = catMap.get(i.category) || { category: i.category, qty: 0, amount: 0 }; c.qty += i.qty; c.amount += i.amount; catMap.set(i.category, c); }

  const staffRows = await d.select({ id: schema.orders.paidConfirmedBy, name: schema.staff.name, orders: sql<number>`count(*)::int`, amount: sql<number>`sum(${schema.orders.totalPaise})::int` })
    .from(schema.orders).leftJoin(schema.staff, eq(schema.orders.paidConfirmedBy, schema.staff.id))
    .where(sales).groupBy(schema.orders.paidConfirmedBy, schema.staff.name).orderBy(sql`4 desc`);

  const discounts = await d.select({ kotNo: schema.orders.kotNo, spot: schema.orders.spotLabel, amount: schema.orders.discountPaise, coupon: schema.orders.couponCode, reason: schema.orders.discountReason, at: schema.orders.paidAt })
    .from(schema.orders).where(and(sales, sql`${schema.orders.discountPaise} > 0`)).orderBy(schema.orders.paidAt);

  const cancels = await d.select().from(schema.auditLog)
    .where(and(eq(schema.auditLog.venueId, venueId), inArray(schema.auditLog.action, ['item_cancelled', 'order_rejected']), gte(schema.auditLog.at, start), lt(schema.auditLog.at, end)))
    .orderBy(schema.auditLog.at);

  const cash = await d.select().from(schema.cashEntries).where(and(eq(schema.cashEntries.venueId, venueId), gte(schema.cashEntries.at, start), lt(schema.cashEntries.at, end))).orderBy(schema.cashEntries.at);
  const shifts = await d.select().from(schema.cashShifts).where(and(eq(schema.cashShifts.venueId, venueId), gte(schema.cashShifts.openedAt, start), lt(schema.cashShifts.openedAt, end))).orderBy(schema.cashShifts.openedAt);

  const [covers] = await d.select({ tables: sql<number>`count(*)::int`, guests: sql<number>`coalesce(sum(${schema.tableSessions.guests}),0)::int` })
    .from(schema.tableSessions).where(and(eq(schema.tableSessions.venueId, venueId), eq(schema.tableSessions.status, 'closed'), gte(schema.tableSessions.closedAt, start), lt(schema.tableSessions.closedAt, end)));

  // Still open right now: unpaid counter orders and running tables (settle them before closing the day).
  const unpaid = await d.select({ id: schema.orders.id, kotNo: schema.orders.kotNo, spot: schema.orders.spotLabel, total: schema.orders.totalPaise, at: schema.orders.createdAt })
    .from(schema.orders).where(and(eq(schema.orders.venueId, venueId), eq(schema.orders.payStatus, 'unpaid'), notInArray(schema.orders.status, ['cancelled', 'rejected', 'awaiting_payment'])))
    .orderBy(desc(schema.orders.createdAt)).limit(50);
  const [openTables] = await d.select({ n: sql<number>`count(*)::int` }).from(schema.tableSessions)
    .where(and(eq(schema.tableSessions.venueId, venueId), inArray(schema.tableSessions.status, ['open', 'bill_requested'])));

  const sumKind = (k: string) => cash.filter(c => c.kind === k).reduce((a, c) => a + c.amountPaise, 0);
  return {
    from, to, bills, cancelledBills,
    payments: pay.rows as { method: string; bills: number; amount: number }[],
    channels, items, categories: [...catMap.values()].sort((a, b) => b.amount - a.amount),
    staff: staffRows.map(r => ({ name: r.name || (r.id ? 'Staff' : 'Not recorded'), orders: r.orders, amount: r.amount })),
    discounts, cancels: cancels.map(c => ({ at: c.at, action: c.action, by: c.staffName, ...(c.after as { kotNo?: number; spot?: string; name?: string; qty?: number; amountPaise?: number; reason?: string; paid?: boolean }) })),
    cash: { entries: cash, inPaise: sumKind('in'), outPaise: sumKind('out'), expensePaise: sumKind('expense') }, shifts,
    covers, open: { unpaid, tables: openTables.n },
  };
}
export type DayReport = Awaited<ReturnType<typeof dayReport>>;

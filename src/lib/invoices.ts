// GST bills (tax invoices).
// - Pay-first orders get a bill when staff confirm the payment.
// - Running-bill tables get one bill when the table is closed (all rounds together).
// - Numbers run in sequence per vendor per financial year (1 April – 31 March): PREFIX/2627/00001.
// - A paid order that is later rejected has its bill marked "cancelled" (the number is never reused).
import { and, eq, inArray, isNotNull, ne, notInArray, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { TZ } from './util';

type Vendor = typeof schema.vendors.$inferSelect;
export type Invoice = typeof schema.invoices.$inferSelect;

/** Financial year in India for a date: "2026-27" (April to March). */
export function fyOf(at = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).formatToParts(at).map(x => [x.type, x.value]));
  const y = Number(p.year), m = Number(p.month);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Short bill prefix from the vendor's setting, or from the business name: "Aurora Cinemas" → "AC". */
export function invoicePrefix(v: Pick<Vendor, 'invoicePrefix' | 'name'>) {
  const set = (v.invoicePrefix || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  if (set) return set;
  const words = v.name.toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  const p = words.length > 1 ? words.slice(0, 3).map(w => w[0]).join('') : (words[0] || 'INV').slice(0, 3);
  return p || 'INV';
}

async function nextSeq(vendorId: string, fy: string) {
  const r = await db().insert(schema.invoiceCounters).values({ vendorId, fy, last: 1 })
    .onConflictDoUpdate({ target: [schema.invoiceCounters.vendorId, schema.invoiceCounters.fy], set: { last: sql`${schema.invoiceCounters.last} + 1` } })
    .returning({ last: schema.invoiceCounters.last });
  return r[0].last;
}

type Src = { orders: (typeof schema.orders.$inferSelect)[]; vendor: Vendor; venueId: string; taxBps: number; payMethod: string; spotLabel: string; customerId: string | null };

async function issue(src: Src, link: { orderId?: string; tableSessionId?: string }, at: Date) {
  const ids = src.orders.map(o => o.id);
  const items = ids.length ? await db().select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, ids)) : [];
  // Merge identical lines (same name and price) across rounds.
  const map = new Map<string, schema.InvoiceLine>();
  for (const i of items) {
    const k = `${i.name}|${i.pricePaise}`;
    const cur = map.get(k);
    if (cur) cur.qty += i.qty; else map.set(k, { name: i.name, qty: i.qty, pricePaise: i.pricePaise, veg: i.veg });
  }
  const sum = (k: 'subtotalPaise' | 'discountPaise' | 'taxPaise' | 'totalPaise') => src.orders.reduce((a, o) => a + o[k], 0);
  const subtotal = sum('subtotalPaise'), discount = sum('discountPaise'), tax = sum('taxPaise'), total = sum('totalPaise');
  const cgst = Math.floor(tax / 2);
  const cust = src.customerId ? (await db().select().from(schema.customers).where(eq(schema.customers.id, src.customerId)))[0] : null;
  const fy = fyOf(at);
  const seq = await nextSeq(src.vendor.id, fy);
  const number = `${invoicePrefix(src.vendor)}/${fy.slice(2, 4)}${fy.slice(5)}/${String(seq).padStart(5, '0')}`;
  const [inv] = await db().insert(schema.invoices).values({
    vendorId: src.vendor.id, venueId: src.venueId, ...link, customerId: src.customerId, fy, seq, number,
    kotNos: src.orders.map(o => o.kotNo), spotLabel: src.spotLabel,
    customerName: cust?.name ?? '', customerPhone: cust?.phone ?? '',
    lines: [...map.values()], subtotalPaise: subtotal, discountPaise: discount, taxablePaise: subtotal - discount,
    taxBps: src.taxBps, cgstPaise: cgst, sgstPaise: tax - cgst, totalPaise: total, payMethod: src.payMethod, issuedAt: at,
  }).onConflictDoNothing().returning();
  return inv ?? null;
}

/** Bill for one paid order (pay-first modes). Safe to call twice. */
export async function issueForOrder(orderId: string, at = new Date()) {
  const existing = (await db().select().from(schema.invoices).where(eq(schema.invoices.orderId, orderId)))[0];
  if (existing) return existing;
  const o = (await db().select().from(schema.orders).where(eq(schema.orders.id, orderId)))[0];
  if (!o || o.payStatus !== 'paid' || o.tableSessionId && o.payMethod === 'bill') return null;
  const venue = (await db().select().from(schema.venues).where(eq(schema.venues.id, o.venueId)))[0];
  const vendor = (await db().select().from(schema.vendors).where(eq(schema.vendors.id, o.vendorId)))[0];
  return issue({ orders: [o], vendor, venueId: o.venueId, taxBps: venue.taxBps, payMethod: o.payMethod || 'upi_shop', spotLabel: o.spotLabel, customerId: o.customerId },
    { orderId: o.id }, at);
}

/** One bill for a closed running-bill table: every round that doesn't already have its own bill. */
export async function issueForTable(tableSessionId: string, at = new Date()) {
  const existing = (await db().select().from(schema.invoices).where(eq(schema.invoices.tableSessionId, tableSessionId)))[0];
  if (existing) return existing;
  const ts = (await db().select().from(schema.tableSessions).where(eq(schema.tableSessions.id, tableSessionId)))[0];
  if (!ts || ts.status !== 'closed') return null;
  const billed = db().select({ id: schema.invoices.orderId }).from(schema.invoices).where(isNotNull(schema.invoices.orderId));
  const os = await db().select().from(schema.orders).where(and(
    eq(schema.orders.tableSessionId, ts.id), ne(schema.orders.status, 'rejected'), ne(schema.orders.status, 'cancelled'),
    notInArray(schema.orders.id, billed),
  )).orderBy(schema.orders.createdAt);
  if (!os.length) return null;
  const venue = (await db().select().from(schema.venues).where(eq(schema.venues.id, ts.venueId)))[0];
  const vendor = (await db().select().from(schema.vendors).where(eq(schema.vendors.id, venue.vendorId)))[0];
  const spot = (await db().select().from(schema.spots).where(eq(schema.spots.id, ts.spotId)))[0];
  return issue({ orders: os, vendor, venueId: venue.id, taxBps: venue.taxBps, payMethod: ts.payMethod || 'cash', spotLabel: spot ? `Table ${spot.label}` : '', customerId: os[0].customerId },
    { tableSessionId: ts.id }, at);
}

/** A paid order was rejected: its bill stays on record as cancelled. */
export async function cancelForOrder(orderId: string) {
  await db().update(schema.invoices).set({ status: 'cancelled', cancelledAt: new Date() })
    .where(and(eq(schema.invoices.orderId, orderId), eq(schema.invoices.status, 'issued')));
}

/** The bill an order belongs to (its own, or its table's). */
export async function invoiceForOrder(o: { id: string; tableSessionId: string | null }) {
  const own = (await db().select().from(schema.invoices).where(eq(schema.invoices.orderId, o.id)))[0];
  if (own) return own;
  if (o.tableSessionId) return (await db().select().from(schema.invoices).where(eq(schema.invoices.tableSessionId, o.tableSessionId)))[0] ?? null;
  return null;
}

/** Amount in words, Indian style: 1234.50 → "One thousand two hundred thirty-four rupees and fifty paise only". */
export function inWords(paise: number) {
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const two = (n: number) => n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? '-' + ones[n % 10] : '');
  const three = (n: number) => (n >= 100 ? ones[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' : '') : '') + (n % 100 ? two(n % 100) : '');
  const words = (n: number) => {
    if (n === 0) return 'zero';
    const parts: string[] = [];
    const crore = Math.floor(n / 1e7); n %= 1e7;
    const lakh = Math.floor(n / 1e5); n %= 1e5;
    const thousand = Math.floor(n / 1e3); n %= 1e3;
    if (crore) parts.push(words(crore) + ' crore');
    if (lakh) parts.push(two(lakh) + ' lakh');
    if (thousand) parts.push(two(thousand) + ' thousand');
    if (n) parts.push(three(n));
    return parts.join(' ');
  };
  const r = Math.floor(paise / 100), p = paise % 100;
  const s = `${words(r)} rupees${p ? ` and ${two(p)} paise` : ''} only`;
  return s[0].toUpperCase() + s.slice(1);
}

/** On start-up: give a bill to any paid order / closed table that doesn't have one yet (e.g. data from before bills existed). */
export async function backfillInvoices() {
  const billedOrders = db().select({ id: schema.invoices.orderId }).from(schema.invoices).where(isNotNull(schema.invoices.orderId));
  const os = await db().select({ id: schema.orders.id, paidAt: schema.orders.paidAt }).from(schema.orders)
    .where(and(eq(schema.orders.payStatus, 'paid'), sql`${schema.orders.tableSessionId} is null`, ne(schema.orders.status, 'rejected'), notInArray(schema.orders.id, billedOrders)))
    .orderBy(schema.orders.paidAt);
  for (const o of os) await issueForOrder(o.id, o.paidAt ?? new Date());
  const billedTables = db().select({ id: schema.invoices.tableSessionId }).from(schema.invoices).where(isNotNull(schema.invoices.tableSessionId));
  const ts = await db().select({ id: schema.tableSessions.id, closedAt: schema.tableSessions.closedAt }).from(schema.tableSessions)
    .where(and(eq(schema.tableSessions.status, 'closed'), notInArray(schema.tableSessions.id, billedTables))).orderBy(schema.tableSessions.closedAt);
  for (const t of ts) await issueForTable(t.id, t.closedAt ?? new Date());
  if (os.length + ts.length) console.log(`  Created ${os.length + ts.length} GST bills for earlier orders.`);
}

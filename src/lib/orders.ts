// Order lifecycle. Pay-first modes:
//   awaiting_payment (unpaid → claimed) → confirmed (paid by staff) → preparing → ready → [out] → delivered
// Running bill (table_bill): confirmed immediately (on_bill); paid when the table's bill is settled.
import { and, desc, eq, gte, inArray, ne, sql } from 'drizzle-orm';
import { db, schema, type DB } from '@/db';
import type { OrderStatus, PayMethod, TimelineEntry } from '@/db/schema';
import { bad, notFound } from './api';
import { emit } from './realtime';
import { localParts } from './util';
import type { Staff } from './auth';
import { audit } from './audit';
import { cancelForOrder, issueForOrder, issueForTable } from './invoices';
import { consumeStock, returnStock } from './stock';
import type { Payment } from '@/db/schema';

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
type Venue = typeof schema.venues.$inferSelect;
type Order = typeof schema.orders.$inferSelect;

export const now = () => new Date().toISOString();
const tl = (status: string, by?: string): TimelineEntry => ({ status, at: now(), ...(by ? { by } : {}) });

export async function nextNumber(tx: Tx | DB, venueId: string, kind: 'kot' | 'bill') {
  const date = localParts().date;
  const r = await tx.insert(schema.dailyCounters).values({ venueId, date, kind, last: 1 })
    .onConflictDoUpdate({ target: [schema.dailyCounters.venueId, schema.dailyCounters.date, schema.dailyCounters.kind], set: { last: sql`${schema.dailyCounters.last} + 1` } })
    .returning({ last: schema.dailyCounters.last });
  return { n: r[0].last, date };
}

// ---------------------------------------------------------------- pricing & coupons
/** One cart line: an item, its size (if it has sizes), chosen add-ons and a note for the kitchen. */
export type CartLine = { itemId: string; qty: number; variantId?: string | null; addonIds?: string[]; note?: string };
export type PricedLine = Awaited<ReturnType<typeof priceCart>>['lines'][number];

export async function priceCart(venue: Venue, lines: CartLine[]) {
  const ids = [...new Set(lines.map(l => l.itemId))].filter(x => /^[0-9a-f-]{36}$/.test(x));
  if (!ids.length) throw bad('Your cart is empty.');
  const rows = await db().select({ item: schema.items, cat: schema.categories, st: schema.stations })
    .from(schema.items)
    .innerJoin(schema.categories, eq(schema.items.categoryId, schema.categories.id))
    .leftJoin(schema.stations, eq(schema.items.stationId, schema.stations.id))
    .where(and(eq(schema.items.venueId, venue.id), inArray(schema.items.id, ids)));
  const out = [];
  for (const l of lines) {
    const r = rows.find(x => x.item.id === l.itemId);
    const qty = Math.max(0, Math.min(99, Math.floor(Number(l.qty) || 0)));
    if (!r || !qty) continue;
    const live = r.item.isLive && r.cat.isLive && (r.st ? r.st.isLive : true);
    if (!live) throw bad(`${r.item.name} just sold out. Remove it from your cart to continue.`, 'SOLD_OUT');
    // Size: required when the item has sizes.
    let variant: schema.ItemVariant | null = null;
    if (r.item.variants.length) {
      variant = r.item.variants.find(v => v.id === l.variantId) ?? null;
      if (!variant) throw bad(`Choose a size for ${r.item.name}.`, 'CHOOSE_SIZE');
    }
    // Add-ons: each group's min/max is checked.
    const picked = [...new Set((l.addonIds || []).map(String))];
    const addons: { id: string; name: string; pricePaise: number }[] = [];
    for (const g of r.item.addonGroups) {
      const chosen = g.options.filter(o => picked.includes(o.id));
      if (chosen.length < g.min) throw bad(`Choose at least ${g.min} in “${g.name}” for ${r.item.name}.`, 'CHOOSE_ADDON');
      if (g.max && chosen.length > g.max) throw bad(`Choose at most ${g.max} in “${g.name}” for ${r.item.name}.`, 'CHOOSE_ADDON');
      addons.push(...chosen.map(o => ({ id: o.id, name: o.name, pricePaise: o.pricePaise })));
    }
    const unit = (variant ? variant.pricePaise : r.item.pricePaise) + addons.reduce((a, x) => a + x.pricePaise, 0);
    out.push({
      item: r.item, station: r.st, qty, variant, addons, unitPaise: unit,
      name: variant ? `${r.item.name} (${variant.name})` : r.item.name,
      note: String(l.note || '').trim().slice(0, 120),
    });
  }
  if (!out.length) throw bad('Your cart is empty.');
  const subtotal = out.reduce((s, l) => s + l.unitPaise * l.qty, 0);
  return { lines: out, subtotal };
}

/** GST on the amount after discount, then optional rounding to the nearest rupee. */
export function computeTotals(subtotal: number, discount: number, taxBps: number, roundOff: boolean) {
  const taxable = Math.max(0, subtotal - discount);
  const tax = Math.round(taxable * taxBps / 10000);
  const raw = taxable + tax;
  const total = roundOff ? Math.round(raw / 100) * 100 : raw;
  return { tax, roundOff: total - raw, total };
}
export const roundsOff = (v: Venue) => v.settings.roundOff === true;

/** Display name of an order line with its add-ons: "Pizza (Large) + Extra cheese". */
export const lineName = (i: { name: string; addons?: { name: string }[] | null }) =>
  i.addons?.length ? `${i.name} + ${i.addons.map(a => a.name).join(', ')}` : i.name;

type Tx2 = Tx | DB;
/** Saves the order lines and one KOT per station. */
export async function writeLinesAndKots(tx: Tx2, orderId: string, venueId: string, lines: PricedLine[], release: boolean) {
  await tx.insert(schema.orderItems).values(lines.map(l => ({
    orderId, itemId: l.item.id, stationId: l.station?.id ?? null, name: l.name, pricePaise: l.unitPaise, qty: l.qty, veg: l.item.veg,
    variantId: l.variant?.id ?? null, variantName: l.variant?.name ?? null, addons: l.addons, note: l.note,
  })));
  const byStation = new Map<string, string>();
  for (const l of lines) byStation.set(l.station?.id ?? 'none', l.station?.name ?? 'Kitchen');
  await tx.insert(schema.kots).values([...byStation].map(([sid, name]) => ({
    orderId, venueId, stationId: sid === 'none' ? null : sid, stationName: name, status: release ? 'new' as const : 'held' as const,
  })));
}

export type CouponCheck = { ok: true; code: string; discount: number; description: string } | { ok: false; error: string; code?: string };

export async function checkCoupon(venue: Venue, codeIn: string, subtotal: number, customerId: string | null): Promise<CouponCheck> {
  const code = String(codeIn || '').trim().toUpperCase();
  if (!code) return { ok: false, error: 'Enter a coupon code' };
  const c = (await db().select().from(schema.coupons).where(and(eq(schema.coupons.vendorId, venue.vendorId), eq(schema.coupons.code, code))))[0];
  if (!c || !c.active || (c.venueId && c.venueId !== venue.id)) return { ok: false, error: 'This coupon code is not valid here' };
  if (c.expiresAt && c.expiresAt < new Date()) return { ok: false, error: 'This coupon has expired' };
  if (c.usageLimit && c.used >= c.usageLimit) return { ok: false, error: 'This coupon has been fully used' };
  if (subtotal < c.minOrderPaise) return { ok: false, error: `Add ₹${Math.ceil((c.minOrderPaise - subtotal) / 100)} more to use ${code}`, code };
  if (c.perCustomer && customerId) {
    const used = await db().select({ n: sql<number>`count(*)::int` }).from(schema.orders).where(and(
      eq(schema.orders.customerId, customerId), eq(schema.orders.couponCode, code), eq(schema.orders.vendorId, venue.vendorId),
      inArray(schema.orders.payStatus, ['paid', 'on_bill'])));
    if (used[0].n >= c.perCustomer) return { ok: false, error: `You have already used ${code}` };
  }
  let d = c.type === 'percent' ? Math.round(subtotal * c.value / 100) : c.value;
  if (c.maxDiscountPaise) d = Math.min(d, c.maxDiscountPaise);
  return { ok: true, code, discount: Math.min(d, subtotal), description: c.description };
}

// Coupons shown in the cart, with the best one first and "add ₹X more" hints.
export async function couponSuggestions(venue: Venue, subtotal: number, customerId: string | null) {
  const list = await db().select().from(schema.coupons).where(and(eq(schema.coupons.vendorId, venue.vendorId), eq(schema.coupons.active, true)));
  const out = [];
  for (const c of list) {
    if (c.venueId && c.venueId !== venue.id) continue;
    if (c.expiresAt && c.expiresAt < new Date()) continue;
    if (c.usageLimit && c.used >= c.usageLimit) continue;
    const r = await checkCoupon(venue, c.code, subtotal, customerId);
    const potential = c.type === 'percent' ? Math.min(Math.round(Math.max(subtotal, c.minOrderPaise) * c.value / 100), c.maxDiscountPaise || Infinity) : c.value;
    out.push({
      code: c.code, description: c.description, minOrderPaise: c.minOrderPaise,
      applicable: r.ok, savePaise: r.ok ? r.discount : potential,
      addMorePaise: !r.ok && subtotal < c.minOrderPaise ? c.minOrderPaise - subtotal : 0,
      reason: r.ok ? null : r.error,
    });
  }
  out.sort((a, b) => Number(b.applicable) - Number(a.applicable) || b.savePaise - a.savePaise);
  return out;
}

// ---------------------------------------------------------------- create
export async function createOrder(input: {
  venue: Venue; vendorId: string; visit: typeof schema.visits.$inferSelect; spot: typeof schema.spots.$inferSelect;
  tableSession: typeof schema.tableSessions.$inferSelect | null; showLabel: string | null; intervalAt: Date | null;
  customer: { id: string; name: string }; lines: CartLine[];
  couponCode?: string | null; deliverAt?: 'now' | 'interval'; note?: string; payMethod?: 'upi_shop' | 'cash'; areaName?: string | null;
}) {
  const { venue } = input;
  const { lines, subtotal } = await priceCart(venue, input.lines);
  let discount = 0, couponCode: string | null = null;
  if (input.couponCode) {
    const c = await checkCoupon(venue, input.couponCode, subtotal, input.customer.id);
    if (!c.ok) throw bad(c.error);
    discount = c.discount; couponCode = c.code;
  }
  const { tax, roundOff, total } = computeTotals(subtotal, discount, venue.taxBps, roundsOff(venue));
  const running = venue.serviceMode === 'table_bill';
  const payMethod: PayMethod = running ? 'bill' : input.payMethod === 'cash' ? 'cash' : 'upi_shop';
  if (payMethod === 'cash' && !venue.settings.acceptCash) throw bad('This venue accepts UPI only.');

  const fulfilment = venue.serviceMode === 'seat_delivery' ? (payMethod === 'cash' ? 'pickup' : 'seat')
    : venue.serviceMode === 'table_bill' || venue.serviceMode === 'table_prepay' ? 'table' : 'pickup';
  const deliverAt = venue.serviceMode === 'seat_delivery' && input.deliverAt === 'interval' && input.intervalAt && input.intervalAt > new Date() ? 'interval' : 'now';
  // Interval orders reach the kitchen 15 minutes before the interval.
  const releaseAt = deliverAt === 'interval' && input.intervalAt ? new Date(input.intervalAt.getTime() - 15 * 60e3) : null;

  const order = await db().transaction(async tx => {
    const { n, date } = await nextNumber(tx, venue.id, 'kot');
    const status: OrderStatus = running ? 'confirmed' : 'awaiting_payment';
    const [o] = await tx.insert(schema.orders).values({
      venueId: venue.id, vendorId: input.vendorId, customerId: input.customer.id, spotId: input.spot.id,
      tableSessionId: input.tableSession?.id ?? null, kotNo: n, businessDate: date, status,
      payStatus: running ? 'on_bill' : 'unpaid', payMethod, fulfilment, deliverAt, releaseAt,
      showLabel: input.showLabel, spotLabel: spotLabel(input.spot, venue, input.areaName ?? undefined),
      subtotalPaise: subtotal, discountPaise: discount, taxPaise: tax, roundOffPaise: roundOff, totalPaise: total, couponCode,
      note: String(input.note || '').slice(0, 200), timeline: [tl(status)],
    }).returning();
    // Running bill: the table's first QR order waits until staff accept it (unless the venue turned that off).
    const waitForStaff = running && venue.settings.approveFirstOrder !== false && !input.tableSession?.acceptedAt;
    const releaseNow = (running ? !waitForStaff : venue.settings.startBeforePayment) && deliverAt === 'now';
    await writeLinesAndKots(tx, o.id, venue.id, lines, releaseNow);
    if (running && couponCode) await tx.update(schema.coupons).set({ used: sql`${schema.coupons.used} + 1` })
      .where(and(eq(schema.coupons.vendorId, venue.vendorId), eq(schema.coupons.code, couponCode)));
    if (input.tableSession?.status === 'bill_requested') {
      await tx.update(schema.tableSessions).set({ status: 'open', payStatus: 'unpaid', payMethod: null }).where(eq(schema.tableSessions.id, input.tableSession.id));
    }
    return o;
  });
  await consumeStock(order.id);
  await broadcastOrder(order.id, 'new');
  return order;
}

export function spotLabel(spot: typeof schema.spots.$inferSelect, venue: Venue, areaName?: string) {
  if (spot.kind === 'seat') return `${areaName ? areaName + ' · ' : ''}Seat ${spot.label}`;
  if (spot.kind === 'table') return `Table ${spot.label}`;
  return spot.label;
}

// ---------------------------------------------------------------- read models
export async function loadOrders(where: ReturnType<typeof eq> | undefined, limit = 200) {
  const os = await db().select().from(schema.orders).where(where).orderBy(desc(schema.orders.createdAt)).limit(limit);
  return hydrate(os);
}
export async function hydrate(os: Order[]) {
  if (!os.length) return [];
  const ids = os.map(o => o.id);
  const [its, ks] = await Promise.all([
    db().select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, ids)),
    db().select().from(schema.kots).where(inArray(schema.kots.orderId, ids)),
  ]);
  return os.map(o => ({ ...o, items: its.filter(i => i.orderId === o.id), kots: ks.filter(k => k.orderId === o.id) }));
}
export type FullOrder = Awaited<ReturnType<typeof hydrate>>[number];

export async function getFullOrder(id: string) {
  const o = (await db().select().from(schema.orders).where(eq(schema.orders.id, id)))[0];
  if (!o) throw notFound('Order not found');
  return (await hydrate([o]))[0];
}

/** A guest's QR order at a table that staff have not accepted yet: it is on hold and the kitchen has not seen it. */
export const awaitingStaff = (o: { payStatus: string; status: string; releaseAt: Date | string | null; kots: { status: string }[] }) =>
  o.payStatus === 'on_bill' && !o.releaseAt && !['cancelled', 'rejected'].includes(o.status) && o.kots.length > 0 && o.kots.every(k => k.status === 'held');

/** Staff accept the table: everything waiting there goes to the kitchen, and its next QR orders go straight through. */
export async function acceptTable(orderId: string, s: Staff) {
  const o = await getFullOrder(orderId);
  if (!o.tableSessionId || !awaitingStaff(o)) throw bad(`KOT ${o.kotNo} is not waiting to be accepted.`);
  await db().update(schema.tableSessions).set({ acceptedAt: new Date(), acceptedBy: s.name }).where(eq(schema.tableSessions.id, o.tableSessionId));
  const waiting = (await hydrate(await db().select().from(schema.orders).where(eq(schema.orders.tableSessionId, o.tableSessionId)))).filter(awaitingStaff);
  for (const w of waiting) {
    await db().update(schema.orders).set({ timeline: [...w.timeline, tl('accepted', s.name)] }).where(eq(schema.orders.id, w.id));
    await releaseKots(w.id);
  }
  await audit(s, { action: 'table_accepted', entity: 'table_session', entityId: o.tableSessionId, venueId: o.venueId, after: { spot: o.spotLabel, kotNos: waiting.map(w => w.kotNo) } });
  for (const w of waiting) await broadcastOrder(w.id, 'new');
  await broadcastTable(o.tableSessionId);
  return getFullOrder(orderId);
}

// What the customer sees (no internal staff ids).
export function customerView(o: FullOrder) {
  return {
    id: o.id, venueId: o.venueId, kotNo: o.kotNo, status: o.status, payStatus: o.payStatus, payMethod: o.payMethod,
    fulfilment: o.fulfilment, deliverAt: o.deliverAt, releaseAt: o.releaseAt, showLabel: o.showLabel, spotLabel: o.spotLabel,
    subtotalPaise: o.subtotalPaise, discountPaise: o.discountPaise, taxPaise: o.taxPaise, totalPaise: o.totalPaise,
    couponCode: o.couponCode, note: o.note, rejectReason: o.rejectReason, timeline: o.timeline, createdAt: o.createdAt,
    tableSessionId: o.tableSessionId, utrLast4: o.utrLast4, awaitingStaff: awaitingStaff(o),
    items: o.items.map(i => ({ name: lineName(i), qty: i.qty, pricePaise: i.pricePaise, veg: i.veg, note: i.note })),
  };
}

export async function broadcastOrder(id: string, kind: 'new' | 'update' | 'payment_claim' = 'update') {
  const o = await getFullOrder(id);
  const rooms = [`venue:${o.venueId}`, ...o.kots.filter(k => k.stationId && k.status !== 'held').map(k => `station:${k.stationId}`)];
  emit(rooms, 'order', { kind, order: o });
  emit(`order:${o.id}`, 'order', { kind, order: customerView(o) });
  if (o.tableSessionId) emit(`table:${o.tableSessionId}`, 'table', { tableSessionId: o.tableSessionId });
  return o;
}

// ---------------------------------------------------------------- transitions
async function setStatus(o: Order, status: OrderStatus, by?: Staff | null, extra: Partial<Order> = {}) {
  await db().update(schema.orders).set({ status, timeline: [...o.timeline, tl(status, by?.name)], ...extra }).where(eq(schema.orders.id, o.id));
}

export async function releaseKots(orderId: string) {
  const o = (await db().select().from(schema.orders).where(eq(schema.orders.id, orderId)))[0];
  if (!o) return;
  const paidOrOk = o.payStatus === 'paid' || o.payStatus === 'on_bill' || (await venueOf(o.venueId)).settings.startBeforePayment;
  const timeOk = !o.releaseAt || o.releaseAt <= new Date();
  if (paidOrOk && timeOk && !['cancelled', 'rejected'].includes(o.status)) {
    await db().update(schema.kots).set({ status: 'new' }).where(and(eq(schema.kots.orderId, orderId), eq(schema.kots.status, 'held')));
  }
}
const venueOf = async (id: string) => (await db().select().from(schema.venues).where(eq(schema.venues.id, id)))[0];

export async function claimPaid(orderId: string, customerId: string, utr?: string) {
  const o = (await db().select().from(schema.orders).where(and(eq(schema.orders.id, orderId), eq(schema.orders.customerId, customerId))))[0];
  if (!o) throw notFound('Order not found');
  if (o.status !== 'awaiting_payment' || o.payStatus === 'paid') return broadcastOrder(o.id);
  await db().update(schema.orders).set({
    payStatus: 'claimed', utrLast4: utr ? String(utr).replace(/\D/g, '').slice(-4) || null : o.utrLast4,
    timeline: [...o.timeline, tl('payment_claimed')],
  }).where(eq(schema.orders.id, o.id));
  return broadcastOrder(o.id, 'payment_claim');
}

export async function confirmPayment(orderId: string, s: Staff) {
  const o = (await db().select().from(schema.orders).where(eq(schema.orders.id, orderId)))[0];
  if (!o) throw notFound('Order not found');
  if (o.payStatus === 'paid') return broadcastOrder(o.id);
  if (!['awaiting_payment'].includes(o.status)) throw bad('This order is not waiting for payment.');
  await db().transaction(async tx => {
    await tx.update(schema.orders).set({
      payStatus: 'paid', paidAt: new Date(), paidConfirmedBy: s.id, status: 'confirmed',
      payments: [{ method: o.payMethod === 'cash' ? 'cash' : 'upi_shop', amountPaise: o.totalPaise }],
      timeline: [...o.timeline, tl('paid', s.name), tl('confirmed', s.name)],
    }).where(eq(schema.orders.id, o.id));
    if (o.couponCode) await tx.update(schema.coupons).set({ used: sql`${schema.coupons.used} + 1` })
      .where(and(eq(schema.coupons.vendorId, o.vendorId), eq(schema.coupons.code, o.couponCode)));
  });
  await audit(s, { action: o.payMethod === 'cash' ? 'cash_received' : 'upi_payment_confirmed', entity: 'order', entityId: o.id, venueId: o.venueId,
    after: { kotNo: o.kotNo, amountPaise: o.totalPaise, method: o.payMethod } });
  await releaseKots(o.id);
  await issueForOrder(o.id);
  return broadcastOrder(o.id);
}

// Station marks its KOT. The order follows: any started → preparing, all ready → ready.
export async function setKotStatus(kotId: string, status: 'preparing' | 'ready', s: Staff) {
  const k = (await db().select().from(schema.kots).where(eq(schema.kots.id, kotId)))[0];
  if (!k) throw notFound('KOT not found');
  if (k.status === 'held') throw bad('This KOT is not released to the kitchen yet.');
  await db().update(schema.kots).set({ status, ...(status === 'preparing' ? { startedAt: new Date() } : { readyAt: new Date() }) }).where(eq(schema.kots.id, kotId));
  const o = (await db().select().from(schema.orders).where(eq(schema.orders.id, k.orderId)))[0];
  const all = await db().select().from(schema.kots).where(eq(schema.kots.orderId, k.orderId));
  if (all.every(x => x.status === 'ready') && ['confirmed', 'preparing'].includes(o.status)) await setStatus(o, 'ready', s);
  else if (o.status === 'confirmed') await setStatus(o, 'preparing', s);
  return broadcastOrder(o.id);
}

export async function staffAdvance(orderId: string, to: 'preparing' | 'ready' | 'out' | 'delivered', s: Staff) {
  const o = (await db().select().from(schema.orders).where(eq(schema.orders.id, orderId)))[0];
  if (!o) throw notFound('Order not found');
  if (['cancelled', 'rejected', 'delivered'].includes(o.status)) throw bad(`Order KOT ${o.kotNo} is already ${o.status}.`);
  if (awaitingStaff(await getFullOrder(o.id))) throw bad(`Accept KOT ${o.kotNo} first. The kitchen has not received it yet.`);
  if (o.status === 'awaiting_payment' && o.payStatus !== 'on_bill') throw bad(`KOT ${o.kotNo} is not paid yet. Confirm the payment first.`);
  if (to === 'out' && o.fulfilment !== 'seat') throw bad('Only seat-delivery orders go "out".');
  if (to === 'delivered' && o.payStatus === 'unpaid') throw bad(`KOT ${o.kotNo} is not paid yet. Settle the bill first.`);
  if (to === 'ready' || to === 'preparing') {
    await db().update(schema.kots).set(to === 'ready' ? { status: 'ready', readyAt: new Date() } : { status: 'preparing', startedAt: new Date() })
      .where(and(eq(schema.kots.orderId, o.id), ne(schema.kots.status, 'held')));
  }
  await setStatus(o, to, s);
  return broadcastOrder(o.id);
}

export async function rejectOrder(orderId: string, reason: string, s: Staff) {
  const o = (await db().select().from(schema.orders).where(eq(schema.orders.id, orderId)))[0];
  if (!o) throw notFound('Order not found');
  if (['delivered', 'cancelled', 'rejected'].includes(o.status)) throw bad(`KOT ${o.kotNo} is already ${o.status}.`);
  await setStatus(o, 'rejected', s, { rejectReason: reason.slice(0, 200) || 'Rejected by the venue' });
  await audit(s, { action: 'order_rejected', entity: 'order', entityId: o.id, venueId: o.venueId,
    after: { kotNo: o.kotNo, reason, paid: o.payStatus === 'paid', amountPaise: o.totalPaise } });
  if (o.payStatus === 'paid') await cancelForOrder(o.id);
  await returnStock(o.id, s.name);
  return broadcastOrder(o.id);
}

export async function customerCancel(orderId: string, customerId: string) {
  const o = (await db().select().from(schema.orders).where(and(eq(schema.orders.id, orderId), eq(schema.orders.customerId, customerId))))[0];
  if (!o) throw notFound('Order not found');
  if (o.status !== 'awaiting_payment' || o.payStatus !== 'unpaid') throw bad('This order can no longer be cancelled from the app. Please talk to the staff.');
  await setStatus(o, 'cancelled');
  await returnStock(o.id, 'customer');
  return broadcastOrder(o.id);
}

// ---------------------------------------------------------------- table bills (running bill)
export async function tableBill(tableSessionId: string) {
  const ts = (await db().select().from(schema.tableSessions).where(eq(schema.tableSessions.id, tableSessionId)))[0];
  if (!ts) throw notFound('Bill not found');
  const os = await hydrate(await db().select().from(schema.orders)
    .where(and(eq(schema.orders.tableSessionId, ts.id), ne(schema.orders.status, 'rejected'), ne(schema.orders.status, 'cancelled')))
    .orderBy(schema.orders.createdAt));
  const sum = (k: 'subtotalPaise' | 'discountPaise' | 'taxPaise' | 'totalPaise') => os.reduce((a, o) => a + o[k], 0);
  const spot = (await db().select().from(schema.spots).where(eq(schema.spots.id, ts.spotId)))[0];
  return {
    session: ts, spotLabel: spot ? `Table ${spot.label}` : '',
    rounds: os.map(o => ({ awaitingStaff: awaitingStaff(o), id: o.id, kotNo: o.kotNo, status: o.status, createdAt: o.createdAt, totalPaise: o.totalPaise, payStatus: o.payStatus,
      channel: o.channel, discountReason: o.discountReason,
      items: o.items.map(i => ({ id: i.id, name: lineName(i), qty: i.qty, pricePaise: i.pricePaise, veg: i.veg, note: i.note })) })),
    subtotalPaise: sum('subtotalPaise'), discountPaise: sum('discountPaise'), taxPaise: sum('taxPaise'), totalPaise: sum('totalPaise'),
    roundOffPaise: os.reduce((a, o) => a + o.roundOffPaise, 0),
    // What is still to be paid at the table (rounds already paid one by one are not counted again).
    duePaise: os.filter(o => o.payStatus === 'on_bill').reduce((a, o) => a + o.totalPaise, 0),
  };
}

export async function broadcastTable(tableSessionId: string, kind = 'update') {
  const ts = (await db().select().from(schema.tableSessions).where(eq(schema.tableSessions.id, tableSessionId)))[0];
  if (!ts) return;
  emit(`table:${ts.id}`, 'table', { tableSessionId: ts.id, kind });
  emit(`venue:${ts.venueId}`, 'table', { tableSessionId: ts.id, kind });
}

export async function closeTable(tableSessionId: string, s: Staff, methodOrPayments: 'upi_shop' | 'cash' | Payment[]) {
  const bill = await tableBill(tableSessionId);
  if (bill.session.status === 'closed' || bill.session.status === 'merged') throw bad('This table is already closed.');
  const waiting = bill.rounds.filter(r => r.awaitingStaff);
  if (waiting.length) throw bad(`KOT ${waiting.map(r => r.kotNo).join(', ')} from this table has not been accepted yet. Accept or decline it first.`);
  const payments: Payment[] = Array.isArray(methodOrPayments) ? methodOrPayments : bill.duePaise ? [{ method: methodOrPayments, amountPaise: bill.duePaise }] : [];
  checkPayments(payments, bill.duePaise);
  const method = payMethodOf(payments);
  const { n } = await nextNumber(db(), bill.session.venueId, 'bill');
  await db().transaction(async tx => {
    await tx.update(schema.tableSessions).set({
      status: 'closed', payStatus: 'paid', payMethod: method, payments, billNo: n, totalPaise: bill.duePaise, paidConfirmedBy: s.id, closedAt: new Date(),
    }).where(eq(schema.tableSessions.id, tableSessionId));
    await tx.update(schema.orders).set({ payStatus: 'paid', paidAt: new Date(), paidConfirmedBy: s.id, payMethod: method })
      .where(and(eq(schema.orders.tableSessionId, tableSessionId), eq(schema.orders.payStatus, 'on_bill')));
    // Everyone's visit ends: a new scan opens a new bill.
    await tx.update(schema.visits).set({ expiresAt: new Date() }).where(eq(schema.visits.tableSessionId, tableSessionId));
    await tx.update(schema.serviceRequests).set({ status: 'done' }).where(eq(schema.serviceRequests.tableSessionId, tableSessionId));
  });
  await audit(s, { action: method === 'cash' ? 'table_closed_cash' : method === 'split' ? 'table_closed_split' : `table_closed_${method === 'upi_shop' ? 'upi' : method}`,
    entity: 'table_session', entityId: tableSessionId, venueId: bill.session.venueId, after: { billNo: n, totalPaise: bill.duePaise, spot: bill.spotLabel, payments } });
  await issueForTable(tableSessionId);
  await broadcastTable(tableSessionId, 'closed');
}

// ---------------------------------------------------------------- suggestions
export async function mostOrdered(venueId: string, limit = 8) {
  const since = new Date(Date.now() - 30 * 864e5);
  const r = await db().select({ itemId: schema.orderItems.itemId, qty: sql<number>`sum(${schema.orderItems.qty})::int` })
    .from(schema.orderItems).innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .where(and(eq(schema.orders.venueId, venueId), gte(schema.orders.createdAt, since), inArray(schema.orders.payStatus, ['paid', 'on_bill'])))
    .groupBy(schema.orderItems.itemId).orderBy(sql`2 desc`).limit(limit);
  return r.filter(x => x.itemId).map(x => ({ itemId: x.itemId as string, qty: x.qty }));
}

// Items most often bought together with the given items ("Complete your meal").
export async function boughtTogether(venueId: string, itemIds: string[], limit = 6) {
  if (!itemIds.length) return [];
  const since = new Date(Date.now() - 60 * 864e5);
  const r = await db().execute(sql`
    select b.item_id as "itemId", count(*)::int as n
    from order_items a
    join order_items b on b.order_id = a.order_id and b.item_id <> a.item_id
    join orders o on o.id = a.order_id
    where o.venue_id = ${venueId} and o.created_at >= ${since}
      and a.item_id in (${sql.join(itemIds.map(i => sql`${i}::uuid`), sql`, `)})
      and b.item_id not in (${sql.join(itemIds.map(i => sql`${i}::uuid`), sql`, `)})
    group by b.item_id order by n desc limit ${limit}`);
  return (r.rows as { itemId: string; n: number }[]);
}

// ---------------------------------------------------------------- payments
const METHODS = ['upi_shop', 'cash', 'card', 'online'] as const;
/** Payments must be real methods with positive amounts and add up exactly to what is due. */
export function checkPayments(payments: Payment[], due: number) {
  if (!payments.length && due > 0) throw bad('Choose how the guest paid.');
  for (const p of payments) {
    if (!METHODS.includes(p.method)) throw bad('Unknown payment method');
    if (!Number.isInteger(p.amountPaise) || p.amountPaise <= 0) throw bad('Each payment needs an amount.');
  }
  const sum = payments.reduce((a, p) => a + p.amountPaise, 0);
  if (sum !== due) throw bad(`Payments add up to ₹${(sum / 100).toFixed(2)} but the bill is ₹${(due / 100).toFixed(2)}.`);
}
export const payMethodOf = (payments: Payment[]) =>
  (new Set(payments.map(p => p.method)).size > 1 ? 'split' : payments[0]?.method ?? 'cash') as 'upi_shop' | 'cash' | 'card' | 'online' | 'split';

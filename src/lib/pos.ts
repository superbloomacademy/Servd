// Staff billing (POS): orders typed in by the cashier / captain, settling bills, discounts,
// cancelling items after the KOT, and table moves / merges.
import { and, eq, inArray, ne, notInArray, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import type { Channel, OrderStatus, Payment } from '@/db/schema';
import { bad, notFound } from './api';
import type { Staff } from './auth';
import { audit } from './audit';
import { cleanPhone } from './util';
import { issueForOrder } from './invoices';
import { consumeStock, returnLineStock } from './stock';
import {
  broadcastOrder, broadcastTable, checkPayments, computeTotals, nextNumber, now, payMethodOf, priceCart, releaseKots, roundsOff,
  writeLinesAndKots, type CartLine,
} from './orders';

type Venue = typeof schema.venues.$inferSelect;
type Order = typeof schema.orders.$inferSelect;
export type Discount = { kind: 'percent' | 'flat'; value: number; reason: string };

const tl = (status: string, by?: string) => ({ status, at: now(), ...(by ? { by } : {}) });
const CHANNEL_LABEL: Record<Channel, string> = { qr: 'QR', pos: 'Counter', zomato: 'Zomato', swiggy: 'Swiggy', phone: 'Phone order', other: 'Online' };

function discountAmount(d: Discount | null | undefined, subtotal: number) {
  if (!d || !d.value) return 0;
  if (d.value < 0) throw bad('Discount cannot be negative.');
  if (!d.reason?.trim()) throw bad('Give a reason for the discount (it appears in the day-end report).');
  if (d.kind === 'percent') { if (d.value > 100) throw bad('Discount cannot be more than 100%.'); return Math.round(subtotal * d.value / 100); }
  return Math.min(Math.round(d.value), subtotal);
}

/** Find the guest by phone, or add them, so they appear in the customer list. */
async function guestCustomer(phone: string, name: string) {
  const p = cleanPhone(phone);
  if (!p) return null;
  await db().insert(schema.customers).values({ phone: p, name: name.slice(0, 60) }).onConflictDoNothing();
  const c = (await db().select().from(schema.customers).where(eq(schema.customers.phone, p)))[0];
  if (c && !c.name && name) await db().update(schema.customers).set({ name: name.slice(0, 60) }).where(eq(schema.customers.id, c.id));
  return c ?? null;
}

// ---------------------------------------------------------------- new order from the billing screen
export async function createPosOrder(input: {
  venue: Venue; staff: Staff; type: 'dine_in' | 'takeaway' | 'delivery'; channel: Channel;
  spotId?: string | null; guests?: number; lines: CartLine[];
  guestName?: string; guestPhone?: string; address?: string; externalRef?: string; note?: string;
  discount?: Discount | null; payments?: Payment[] | null;
}) {
  const { venue, staff } = input;
  if (input.channel === 'qr') throw bad('Unknown order source');
  const { lines, subtotal } = await priceCart(venue, input.lines);
  const discount = discountAmount(input.discount, subtotal);
  const { tax, roundOff, total } = computeTotals(subtotal, discount, venue.taxBps, roundsOff(venue));
  const guestName = String(input.guestName || '').trim().slice(0, 60);
  const guestPhone = cleanPhone(input.guestPhone) || '';
  if (input.guestPhone && !guestPhone) throw bad('Enter a valid 10-digit mobile number, or leave it empty.');
  const customer = guestPhone ? await guestCustomer(guestPhone, guestName) : null;
  const externalRef = String(input.externalRef || '').trim().slice(0, 40) || null;
  if ((input.channel === 'zomato' || input.channel === 'swiggy') && !externalRef) throw bad(`Enter the ${CHANNEL_LABEL[input.channel]} order ID.`);
  if (input.type === 'delivery' && input.channel === 'phone' && !String(input.address || '').trim()) throw bad('Enter the delivery address.');

  // Dine-in: the order goes on the table's running bill (the table opens if it was free).
  let spot: typeof schema.spots.$inferSelect | null = null;
  let session: typeof schema.tableSessions.$inferSelect | null = null;
  if (input.type === 'dine_in') {
    spot = input.spotId && /^[0-9a-f-]{36}$/.test(input.spotId)
      ? (await db().select().from(schema.spots).where(and(eq(schema.spots.id, input.spotId), eq(schema.spots.venueId, venue.id))))[0] ?? null : null;
    if (!spot || spot.kind !== 'table') throw bad('Choose a table.');
    session = (await db().select().from(schema.tableSessions)
      .where(and(eq(schema.tableSessions.spotId, spot.id), inArray(schema.tableSessions.status, ['open', 'bill_requested']))))[0] ?? null;
  }

  // Pay now? Online orders (Zomato/Swiggy) are already paid to the app.
  let payments = input.type === 'dine_in' ? null : input.payments?.length ? input.payments : null;
  if (!payments && input.type !== 'dine_in' && (input.channel === 'zomato' || input.channel === 'swiggy')) payments = [{ method: 'online', amountPaise: total }];
  if (payments) checkPayments(payments, total);

  const label = input.type === 'dine_in' ? `Table ${spot!.label}`
    : input.channel === 'zomato' || input.channel === 'swiggy' ? `${CHANNEL_LABEL[input.channel]} #${externalRef}`
      : `${input.type === 'delivery' ? 'Delivery' : 'Takeaway'}${guestName ? ` · ${guestName}` : ''}`;

  const order = await db().transaction(async tx => {
    if (input.type === 'dine_in') {
      if (!session) {
        [session] = await tx.insert(schema.tableSessions).values({ venueId: venue.id, spotId: spot!.id, guests: Math.max(0, Math.min(99, input.guests || 0)), openedBy: staff.id, acceptedAt: new Date(), acceptedBy: staff.name }).returning();
      } else {
        const reopen = session.status === 'bill_requested' ? { status: 'open' as const, payStatus: 'unpaid' as const, payMethod: null } : {};
        const guests = input.guests && !session.guests ? { guests: Math.min(99, input.guests) } : {};
        const seen = session.acceptedAt ? {} : { acceptedAt: new Date(), acceptedBy: staff.name };
        if (Object.keys(reopen).length || Object.keys(guests).length || Object.keys(seen).length) await tx.update(schema.tableSessions).set({ ...reopen, ...guests, ...seen }).where(eq(schema.tableSessions.id, session.id));
      }
    }
    const { n, date } = await nextNumber(tx, venue.id, 'kot');
    const paid = !!payments;
    const status: OrderStatus = 'confirmed';
    const [o] = await tx.insert(schema.orders).values({
      venueId: venue.id, vendorId: venue.vendorId, customerId: customer?.id ?? null, spotId: spot?.id ?? null,
      tableSessionId: session?.id ?? null, kotNo: n, businessDate: date, status,
      payStatus: input.type === 'dine_in' ? 'on_bill' : paid ? 'paid' : 'unpaid',
      payMethod: input.type === 'dine_in' ? 'bill' : paid ? payMethodOf(payments!) : null,
      payments: payments ?? [], paidAt: paid ? new Date() : null, paidConfirmedBy: paid ? staff.id : null,
      fulfilment: input.type === 'dine_in' ? 'table' : input.type === 'delivery' ? 'delivery' : 'pickup',
      spotLabel: label, channel: input.channel, createdBy: staff.id, guestName, guestPhone,
      deliveryAddress: String(input.address || '').trim().slice(0, 200), externalRef,
      subtotalPaise: subtotal, discountPaise: discount, billDiscountPaise: discount, discountReason: discount ? input.discount!.reason.trim().slice(0, 100) : null,
      taxPaise: tax, roundOffPaise: roundOff, totalPaise: total,
      note: String(input.note || '').slice(0, 200), timeline: paid ? [tl('paid', staff.name), tl('confirmed', staff.name)] : [tl('confirmed', staff.name)],
    }).returning();
    await writeLinesAndKots(tx, o.id, venue.id, lines, true);
    return o;
  });
  await consumeStock(order.id);
  if (order.payStatus === 'paid') await issueForOrder(order.id);
  await audit(staff, { action: 'pos_order', entity: 'order', entityId: order.id, venueId: venue.id,
    after: { kotNo: order.kotNo, spot: order.spotLabel, channel: order.channel, totalPaise: order.totalPaise, paid: order.payStatus === 'paid', discountPaise: discount } });
  if (session) await broadcastTable(session.id, 'update');
  return broadcastOrder(order.id, 'new');
}

// ---------------------------------------------------------------- settle one order (takeaway, delivery, counter, QR pay-first)
export async function settleOrder(orderId: string, payments: Payment[], s: Staff) {
  const o = (await db().select().from(schema.orders).where(eq(schema.orders.id, orderId)))[0];
  if (!o) throw notFound('Order not found');
  if (o.payStatus === 'paid') return broadcastOrder(o.id);
  if (o.payStatus === 'on_bill') throw bad('This order is on a table bill. Settle it from Tables.');
  if (['cancelled', 'rejected'].includes(o.status)) throw bad(`KOT ${o.kotNo} is ${o.status}.`);
  checkPayments(payments, o.totalPaise);
  const wasWaiting = o.status === 'awaiting_payment';
  await db().transaction(async tx => {
    await tx.update(schema.orders).set({
      payStatus: 'paid', paidAt: new Date(), paidConfirmedBy: s.id, payMethod: payMethodOf(payments), payments,
      status: wasWaiting ? 'confirmed' : o.status,
      timeline: [...o.timeline, tl('paid', s.name), ...(wasWaiting ? [tl('confirmed', s.name)] : [])],
    }).where(eq(schema.orders.id, o.id));
    if (wasWaiting && o.couponCode) await tx.update(schema.coupons).set({ used: sql`${schema.coupons.used} + 1` })
      .where(and(eq(schema.coupons.vendorId, o.vendorId), eq(schema.coupons.code, o.couponCode)));
  });
  await audit(s, { action: 'order_settled', entity: 'order', entityId: o.id, venueId: o.venueId, after: { kotNo: o.kotNo, amountPaise: o.totalPaise, payments } });
  await releaseKots(o.id);
  await issueForOrder(o.id);
  return broadcastOrder(o.id);
}

// ---------------------------------------------------------------- discount on an order or a whole table bill
async function reprice(o: Order, venue: Venue, subtotal: number, discount: number, extra: Partial<Order> = {}) {
  const d = Math.min(discount, subtotal);
  const t = computeTotals(subtotal, d, venue.taxBps, roundsOff(venue));
  await db().update(schema.orders).set({ subtotalPaise: subtotal, discountPaise: d, taxPaise: t.tax, roundOffPaise: t.roundOff, totalPaise: t.total, ...extra })
    .where(eq(schema.orders.id, o.id));
}

export async function applyDiscount(target: { orderId?: string; tableSessionId?: string }, d: Discount, s: Staff) {
  const os = target.orderId
    ? await db().select().from(schema.orders).where(eq(schema.orders.id, target.orderId))
    : await db().select().from(schema.orders).where(and(eq(schema.orders.tableSessionId, target.tableSessionId!), eq(schema.orders.payStatus, 'on_bill'),
      notInArray(schema.orders.status, ['cancelled', 'rejected']))).orderBy(schema.orders.createdAt);
  if (!os.length) throw bad('Nothing to discount yet.');
  if (os.some(o => o.payStatus === 'paid')) throw bad('This bill is already paid. Discounts must be given before payment.');
  if (os.some(o => ['cancelled', 'rejected'].includes(o.status))) throw bad('This order is cancelled.');
  const venue = (await db().select().from(schema.venues).where(eq(schema.venues.id, os[0].venueId)))[0];
  const S = os.reduce((a, o) => a + o.subtotalPaise, 0);
  const D = d.value ? discountAmount(d, S) : 0;
  let left = D;
  for (const [i, o] of os.entries()) {
    const share = i === os.length - 1 ? left : Math.floor(D * o.subtotalPaise / Math.max(1, S));
    left -= share;
    const couponPart = o.discountPaise - o.billDiscountPaise;
    await reprice(o, venue, o.subtotalPaise, couponPart + share, { billDiscountPaise: share, discountReason: D ? d.reason.trim().slice(0, 100) : null });
  }
  await audit(s, { action: D ? 'discount_given' : 'discount_removed', entity: target.orderId ? 'order' : 'table_session', entityId: target.orderId || target.tableSessionId!,
    venueId: venue.id, after: { amountPaise: D, kind: d.kind, value: d.value, reason: d.reason, kotNos: os.map(o => o.kotNo) } });
  for (const o of os) await broadcastOrder(o.id);
  if (target.tableSessionId) await broadcastTable(target.tableSessionId);
  return { discountPaise: D };
}

// ---------------------------------------------------------------- cancel an item after the KOT (reason required)
export async function cancelItem(orderItemId: string, qty: number, reason: string, s: Staff) {
  const it = /^[0-9a-f-]{36}$/.test(orderItemId) ? (await db().select().from(schema.orderItems).where(eq(schema.orderItems.id, orderItemId)))[0] : null;
  if (!it) throw notFound('Item not found');
  const o = (await db().select().from(schema.orders).where(eq(schema.orders.id, it.orderId)))[0];
  if (!reason.trim()) throw bad('Give a reason for cancelling (it appears in the day-end report).');
  if (o.payStatus === 'paid') throw bad(`KOT ${o.kotNo} is already paid. Reject the whole order and refund the guest instead.`);
  if (['cancelled', 'rejected', 'delivered'].includes(o.status)) throw bad(`KOT ${o.kotNo} is already ${o.status}.`);
  const q = Math.max(1, Math.min(it.qty, Math.floor(qty) || 1));
  if (q === it.qty) await db().delete(schema.orderItems).where(eq(schema.orderItems.id, it.id));
  else await db().update(schema.orderItems).set({ qty: it.qty - q }).where(eq(schema.orderItems.id, it.id));

  const rest = await db().select().from(schema.orderItems).where(eq(schema.orderItems.orderId, o.id));
  const venue = (await db().select().from(schema.venues).where(eq(schema.venues.id, o.venueId)))[0];
  if (!rest.length) {
    await reprice(o, venue, 0, 0, { status: 'cancelled', rejectReason: `All items cancelled: ${reason.trim().slice(0, 100)}`,
      timeline: [...o.timeline, tl('cancelled', s.name)] });
  } else {
    const subtotal = rest.reduce((a, i) => a + i.pricePaise * i.qty, 0);
    await reprice(o, venue, subtotal, Math.round(o.discountPaise * subtotal / Math.max(1, o.subtotalPaise)), {
      billDiscountPaise: Math.round(o.billDiscountPaise * subtotal / Math.max(1, o.subtotalPaise)),
    });
  }
  // A station with nothing left to cook loses its ticket.
  const stations = new Set(rest.map(i => i.stationId ?? null));
  const ks = await db().select().from(schema.kots).where(eq(schema.kots.orderId, o.id));
  for (const k of ks) if (!stations.has(k.stationId ?? null) && k.status !== 'ready') await db().delete(schema.kots).where(eq(schema.kots.id, k.id));

  await returnLineStock(o.venueId, o.id, { itemId: it.itemId, variantId: it.variantId, qty: q }, s.name);
  await audit(s, { action: 'item_cancelled', entity: 'order', entityId: o.id, venueId: o.venueId,
    after: { kotNo: o.kotNo, spot: o.spotLabel, name: it.name, qty: q, amountPaise: q * it.pricePaise, reason: reason.trim().slice(0, 200) } });
  if (o.tableSessionId) await broadcastTable(o.tableSessionId);
  return broadcastOrder(o.id);
}

// ---------------------------------------------------------------- tables: move, merge, guests, free
async function openSession(id: string) {
  const t = /^[0-9a-f-]{36}$/.test(id) ? (await db().select().from(schema.tableSessions).where(eq(schema.tableSessions.id, id)))[0] : null;
  if (!t) throw notFound('Table bill not found');
  if (!['open', 'bill_requested'].includes(t.status)) throw bad('This table is already closed.');
  return t;
}
async function freeTable(venueId: string, spotId: string) {
  const sp = /^[0-9a-f-]{36}$/.test(spotId) ? (await db().select().from(schema.spots).where(and(eq(schema.spots.id, spotId), eq(schema.spots.venueId, venueId))))[0] : null;
  if (!sp || sp.kind !== 'table' || !sp.active) throw bad('Choose a table.');
  return sp;
}

export async function moveTable(sessionId: string, toSpotId: string, s: Staff) {
  const t = await openSession(sessionId);
  const to = await freeTable(t.venueId, toSpotId);
  const busy = await db().select({ id: schema.tableSessions.id }).from(schema.tableSessions)
    .where(and(eq(schema.tableSessions.spotId, to.id), inArray(schema.tableSessions.status, ['open', 'bill_requested'])));
  if (busy.length) throw bad(`Table ${to.label} is not free. Use “Merge” to join two tables.`);
  const from = (await db().select().from(schema.spots).where(eq(schema.spots.id, t.spotId)))[0];
  await db().transaction(async tx => {
    await tx.update(schema.tableSessions).set({ spotId: to.id }).where(eq(schema.tableSessions.id, t.id));
    await tx.update(schema.orders).set({ spotId: to.id, spotLabel: `Table ${to.label}` }).where(eq(schema.orders.tableSessionId, t.id));
    await tx.update(schema.visits).set({ spotId: to.id }).where(eq(schema.visits.tableSessionId, t.id));
    await tx.update(schema.serviceRequests).set({ spotId: to.id }).where(eq(schema.serviceRequests.tableSessionId, t.id));
  });
  await audit(s, { action: 'table_moved', entity: 'table_session', entityId: t.id, venueId: t.venueId, after: { from: from?.label, to: to.label } });
  await broadcastTable(t.id);
}

export async function mergeTables(fromId: string, intoId: string, s: Staff) {
  if (fromId === intoId) throw bad('Choose a different table.');
  const a = await openSession(fromId), b = await openSession(intoId);
  if (a.venueId !== b.venueId) throw bad('Choose a table in the same venue.');
  const spots = await db().select().from(schema.spots).where(inArray(schema.spots.id, [a.spotId, b.spotId]));
  const into = spots.find(x => x.id === b.spotId)!, from = spots.find(x => x.id === a.spotId)!;
  await db().transaction(async tx => {
    await tx.update(schema.orders).set({ tableSessionId: b.id, spotId: into.id, spotLabel: `Table ${into.label}` }).where(eq(schema.orders.tableSessionId, a.id));
    await tx.update(schema.visits).set({ tableSessionId: b.id, spotId: into.id }).where(eq(schema.visits.tableSessionId, a.id));
    await tx.update(schema.serviceRequests).set({ tableSessionId: b.id, spotId: into.id }).where(eq(schema.serviceRequests.tableSessionId, a.id));
    await tx.update(schema.tableSessions).set({ guests: a.guests + b.guests, acceptedAt: b.acceptedAt ?? a.acceptedAt, acceptedBy: b.acceptedBy ?? a.acceptedBy }).where(eq(schema.tableSessions.id, b.id));
    await tx.update(schema.tableSessions).set({ status: 'merged', mergedInto: b.id, closedAt: new Date() }).where(eq(schema.tableSessions.id, a.id));
  });
  await audit(s, { action: 'tables_merged', entity: 'table_session', entityId: b.id, venueId: b.venueId, after: { from: from.label, into: into.label } });
  await broadcastTable(a.id, 'closed');
  await broadcastTable(b.id);
}

export async function setGuests(sessionId: string, guests: number) {
  const t = await openSession(sessionId);
  await db().update(schema.tableSessions).set({ guests: Math.max(0, Math.min(99, Math.floor(guests) || 0)) }).where(eq(schema.tableSessions.id, t.id));
  await broadcastTable(t.id);
}

/** Free a table that was opened but has nothing on its bill. */
export async function freeEmptyTable(sessionId: string, s: Staff) {
  const t = await openSession(sessionId);
  const os = await db().select({ id: schema.orders.id }).from(schema.orders)
    .where(and(eq(schema.orders.tableSessionId, t.id), ne(schema.orders.status, 'cancelled'), ne(schema.orders.status, 'rejected')));
  if (os.length) throw bad('This table has orders on its bill. Settle the bill to free it.');
  await db().update(schema.tableSessions).set({ status: 'closed', closedAt: new Date() }).where(eq(schema.tableSessions.id, t.id));
  await db().update(schema.visits).set({ expiresAt: new Date() }).where(eq(schema.visits.tableSessionId, t.id));
  await audit(s, { action: 'table_freed', entity: 'table_session', entityId: t.id, venueId: t.venueId });
  await broadcastTable(t.id, 'closed');
}

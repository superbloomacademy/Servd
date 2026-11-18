// Demo vendors for pitches (Admin → Demo). They are flagged isDemo: shown with a "Demo" badge,
// left out of platform totals and billing, and can be removed or refreshed in one click.
import { and, eq, inArray, notInArray, or, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { bad } from './api';
import type { Staff } from './auth';
import { audit } from './audit';
import { hashPin } from './util';
import { isDemo as demoMode } from './mode';
import { DEMO_PHONES, seedDemoVendors } from '@/db/seed';
import QRCode from 'qrcode';
import { publicBaseUrl } from './env';

/** Demo logins need a PIN that isn't easy to guess on the live site. */
export function checkDemoPin(pin: string) {
  if (demoMode()) { if (!/^\d{4,6}$/.test(pin)) throw bad('PIN must be 4–6 digits.'); return; }
  if (!/^\d{6}$/.test(pin) || /^(\d)\1+$/.test(pin) || '01234567890'.includes(pin) || '09876543210'.includes(pin)) {
    throw bad('Choose a 6-digit PIN that is not easy to guess (not 123456 or 111111).');
  }
}

export async function demoVendors() {
  const vendors = await db().select().from(schema.vendors).where(eq(schema.vendors.isDemo, true)).orderBy(schema.vendors.createdAt);
  if (!vendors.length) return [];
  const ids = vendors.map(v => v.id);
  const venues = await db().select().from(schema.venues).where(inArray(schema.venues.vendorId, ids));
  const staff = await db().select({ name: schema.staff.name, phone: schema.staff.phone, role: schema.staff.role, vendorId: schema.staff.vendorId, venueId: schema.staff.venueId })
    .from(schema.staff).where(inArray(schema.staff.vendorId, ids));
  const spots = venues.length ? await db().select().from(schema.spots).where(and(inArray(schema.spots.venueId, venues.map(v => v.id)), eq(schema.spots.active, true))).orderBy(schema.spots.sort) : [];
  const orders = venues.length ? await db().select({ venueId: schema.orders.venueId, n: sql<number>`count(*)::int`, last: sql<string>`max(${schema.orders.createdAt})` })
    .from(schema.orders).where(inArray(schema.orders.venueId, venues.map(v => v.id))).groupBy(schema.orders.venueId) : [];
  const qr = async (code: string | null) => code ? { url: `${publicBaseUrl()}/q/${code}`, png: await QRCode.toDataURL(`${publicBaseUrl()}/q/${code}`, { margin: 1, width: 240 }) } : null;
  const out = vendors.map(v => ({
    id: v.id, name: v.name, brandColor: v.brandColor, createdAt: v.createdAt,
    venues: venues.filter(x => x.vendorId === v.id).map(x => {
      const sp = spots.filter(s => s.venueId === x.id);
      // One QR for the pitch: a seat in the middle of the hall, or the first table / counter.
      const show = x.serviceMode === 'seat_delivery' ? sp.find(s => s.label === 'F7') ?? sp[0] : sp[0];
      return { id: x.id, name: x.name, type: x.type, serviceMode: x.serviceMode, spotLabel: show ? show.label : null, code: show?.code ?? null, qr: null as null | { url: string; png: string },
        orders: orders.find(o => o.venueId === x.id)?.n ?? 0, lastOrderAt: orders.find(o => o.venueId === x.id)?.last ?? null };
    }),
    logins: staff.filter(s => s.vendorId === v.id).map(s => ({ name: s.name, phone: s.phone, role: s.role })),
  }));
  for (const v of out) for (const x of v.venues) x.qr = await qr(x.code);
  return out;
}

/** Delete one vendor and everything that belongs to it (orders, bills, menu, staff, stock…). Used only for demo vendors. */
async function deleteVendorDeep(vendorId: string) {
  await db().transaction(async tx => {
    const venueIds = (await tx.select({ id: schema.venues.id }).from(schema.venues).where(eq(schema.venues.vendorId, vendorId))).map(v => v.id);
    const staffIds = (await tx.select({ id: schema.staff.id }).from(schema.staff).where(eq(schema.staff.vendorId, vendorId))).map(s => s.id);
    // Sample customers (no email) who only ever ordered at demo venues are removed too.
    const custIds = venueIds.length ? (await tx.selectDistinct({ id: schema.orders.customerId }).from(schema.orders)
      .where(inArray(schema.orders.venueId, venueIds))).map(c => c.id).filter((x): x is string => !!x) : [];
    await tx.delete(schema.invoices).where(eq(schema.invoices.vendorId, vendorId));
    if (venueIds.length) {
      await tx.delete(schema.supportTickets).where(inArray(schema.supportTickets.venueId, venueIds));
      await tx.delete(schema.orders).where(inArray(schema.orders.venueId, venueIds));   // lines and KOTs go with them
      await tx.delete(schema.tableSessions).where(inArray(schema.tableSessions.venueId, venueIds));
    }
    await tx.delete(schema.coupons).where(eq(schema.coupons.vendorId, vendorId));
    if (staffIds.length) await tx.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
    if (venueIds.length) {
      await tx.delete(schema.venues).where(inArray(schema.venues.id, venueIds));        // menu, spots, stock, cash… go with them
      await tx.delete(schema.dailyCounters).where(inArray(schema.dailyCounters.venueId, venueIds));
      await tx.delete(schema.auditLog).where(or(eq(schema.auditLog.vendorId, vendorId), inArray(schema.auditLog.venueId, venueIds)));
    } else await tx.delete(schema.auditLog).where(eq(schema.auditLog.vendorId, vendorId));
    await tx.delete(schema.invoiceCounters).where(eq(schema.invoiceCounters.vendorId, vendorId));
    await tx.delete(schema.vendors).where(eq(schema.vendors.id, vendorId));
    if (custIds.length) {
      const stillOrdering = tx.select({ id: schema.orders.customerId }).from(schema.orders).where(inArray(schema.orders.customerId, custIds));
      const ticketing = tx.select({ id: schema.supportTickets.customerId }).from(schema.supportTickets).where(inArray(schema.supportTickets.customerId, custIds));
      await tx.delete(schema.customers).where(and(inArray(schema.customers.id, custIds), eq(schema.customers.email, ''),
        notInArray(schema.customers.id, stillOrdering), notInArray(schema.customers.id, ticketing)));
    }
  });
}

export async function removeDemo(s: Staff) {
  const vs = await db().select({ id: schema.vendors.id, name: schema.vendors.name }).from(schema.vendors).where(eq(schema.vendors.isDemo, true));
  for (const v of vs) await deleteVendorDeep(v.id);
  await audit(s, { action: 'demo_removed', entity: 'demo', after: { vendors: vs.map(v => v.name) } });
  return vs.length;
}

export async function createDemo(s: Staff, pin: string) {
  checkDemoPin(pin);
  const existing = await db().select({ n: sql<number>`count(*)::int` }).from(schema.vendors).where(eq(schema.vendors.isDemo, true));
  if (existing[0].n) throw bad('Demo venues already exist. Use “Refresh” to make them new again.');
  const taken = await db().select({ phone: schema.staff.phone }).from(schema.staff).where(inArray(schema.staff.phone, DEMO_PHONES));
  if (taken.length) throw bad(`These numbers are already used by real logins, so the demo can’t use them: ${taken.map(t => t.phone).join(', ')}.`);
  const slugs = await db().select({ slug: schema.vendors.slug }).from(schema.vendors)
    .where(inArray(schema.vendors.slug, ['aurora', 'spice-route', 'brew-bay', 'chaat-corner']));
  if (slugs.length) throw bad('A real vendor uses one of the demo names. Contact support.');
  const t = Date.now();
  await seedDemoVendors(hashPin(pin));
  await audit(s, { action: 'demo_created', entity: 'demo', after: { seconds: Math.round((Date.now() - t) / 1000) } });
}

export async function refreshDemo(s: Staff, pin: string) {
  checkDemoPin(pin);
  await removeDemo(s);
  await createDemo(s, pin);
}

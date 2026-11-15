// Go-live checklist for a venue: what the owner still has to do before customers can order.
// Shown to the owner ("Get started") and to us (super admin → vendor → Setup).
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db, schema } from '@/db';

export type StepKey = 'business' | 'brand' | 'payment' | 'menu' | 'qr' | 'team' | 'test';
export type Step = { key: StepKey; label: string; hint: string; done: boolean; required: boolean; tab: string };
export type Checklist = { venueId: string; steps: Step[]; done: number; total: number; ready: boolean };

type Vendor = typeof schema.vendors.$inferSelect;
type Venue = typeof schema.venues.$inferSelect;

/** Checklists for many venues at once (a few grouped queries, not one per venue). */
export async function checklists(venues: Venue[], vendors: Vendor[]): Promise<Map<string, Checklist>> {
  const out = new Map<string, Checklist>();
  if (!venues.length) return out;
  const ids = venues.map(v => v.id);
  const count = async (table: typeof schema.items | typeof schema.spots, extra?: ReturnType<typeof eq>) => {
    const rows = await db().select({ venueId: table.venueId, n: sql<number>`count(*)::int` }).from(table)
      .where(extra ? and(inArray(table.venueId, ids), extra) : inArray(table.venueId, ids)).groupBy(table.venueId);
    return new Map(rows.map(r => [r.venueId, r.n]));
  };
  const [items, spots] = await Promise.all([count(schema.items), count(schema.spots, eq(schema.spots.active, true))]);
  const staffRows = await db().select({ venueId: schema.staff.venueId, n: sql<number>`count(*)::int` }).from(schema.staff)
    .where(and(inArray(schema.staff.venueId, ids), ne(schema.staff.role, 'owner'))).groupBy(schema.staff.venueId);
  const staff = new Map(staffRows.map(r => [r.venueId!, r.n]));
  const orderRows = await db().select({ venueId: schema.orders.venueId, n: sql<number>`count(*)::int` }).from(schema.orders)
    .where(inArray(schema.orders.venueId, ids)).groupBy(schema.orders.venueId);
  const orders = new Map(orderRows.map(r => [r.venueId, r.n]));
  const showRows = await db().select({ venueId: schema.shows.venueId, n: sql<number>`count(*)::int` }).from(schema.shows)
    .where(inArray(schema.shows.venueId, ids)).groupBy(schema.shows.venueId);
  const shows = new Map(showRows.map(r => [r.venueId, r.n]));

  for (const v of venues) {
    const vendor = vendors.find(x => x.id === v.vendorId);
    const needsGstin = v.taxBps > 0;
    const steps: Step[] = [
      { key: 'business', tab: 'settings', required: true, label: 'Business details for bills',
        hint: needsGstin ? 'Legal name, GSTIN and FSSAI number. They print on every bill.' : 'Legal name and FSSAI number. They print on every bill.',
        done: !!(vendor?.legalName && vendor?.fssai && (!needsGstin || vendor?.gstin)) },
      { key: 'payment', tab: 'settings', required: true, label: 'How customers pay you',
        hint: 'Your UPI ID, so customers pay straight into your bank account.',
        done: !!v.upiId },
      { key: 'menu', tab: 'menu', required: true, label: 'Add your menu', hint: 'At least 3 items with prices. Photos help sell more.', done: (items.get(v.id) || 0) >= 3 },
      { key: 'qr', tab: 'qr', required: true,
        label: v.serviceMode === 'seat_delivery' ? 'Seats, shows and QR codes' : v.serviceMode === 'shop_qr' ? 'Your shop QR code' : 'Tables / counters and QR codes',
        hint: v.serviceMode === 'seat_delivery' ? 'Add screens with rows and seats, add show timings, then print the seat stickers.' : 'Create them, then print and stick the QR codes.',
        done: (spots.get(v.id) || 0) > 0 && (v.serviceMode !== 'seat_delivery' || (shows.get(v.id) || 0) > 0) },
      { key: 'brand', tab: 'settings', required: false, label: 'Logo and brand color', hint: 'Customers see your logo on the menu, tracking page and bill.', done: !!vendor?.logoUrl },
      { key: 'team', tab: 'team', required: false, label: 'Staff logins', hint: 'Give the counter, kitchen and runners their own login.', done: (staff.get(v.id) || 0) > 0 },
      { key: 'test', tab: 'live', required: false, label: 'Place a test order', hint: 'Scan one of your QR codes with your phone and order something small.', done: (orders.get(v.id) || 0) > 0 },
    ];
    const done = steps.filter(s => s.done).length;
    out.set(v.id, { venueId: v.id, steps, done, total: steps.length, ready: steps.filter(s => s.required).every(s => s.done) });
  }
  return out;
}

export async function checklistFor(venueId: string) {
  const v = (await db().select().from(schema.venues).where(eq(schema.venues.id, venueId)))[0];
  if (!v) return null;
  const vendor = (await db().select().from(schema.vendors).where(eq(schema.vendors.id, v.vendorId)))[0];
  return (await checklists([v], [vendor])).get(v.id)!;
}

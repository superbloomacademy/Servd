import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { notFound, route } from '@/lib/api';
import { requireCustomer } from '@/lib/auth';
import { customerView, getFullOrder } from '@/lib/orders';
import { publicVendor, publicVenue } from '@/lib/menu';
import { invoiceForOrder } from '@/lib/invoices';

// Only the customer who placed the order can see it. Anyone else gets "not found".
export const GET = route<{ id: string }>(async (_req, { id }) => {
  const c = await requireCustomer();
  if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound('Order not found');
  const o = await getFullOrder(id).catch(() => null);
  if (!o || o.customerId !== c.id) throw notFound('Order not found on this account.');
  const r = (await db().select({ venue: schema.venues, vendor: schema.vendors }).from(schema.venues)
    .innerJoin(schema.vendors, eq(schema.venues.vendorId, schema.vendors.id)).where(eq(schema.venues.id, o.venueId)))[0];
  const inv = await invoiceForOrder(o);
  // "Back to menu": the QR this order came from, but only while the visit is fresh (no ordering from home later),
  // and only if that QR is still switched on and hasn't been replaced since.
  const spot = (await db().select().from(schema.spots).where(eq(schema.spots.id, o.spotId)))[0];
  const fresh = Date.now() - o.createdAt.getTime() < r.venue.settings.sessionHours * 3600e3;
  const menuCode = spot && spot.active && fresh && (!spot.codeReplacedAt || spot.codeReplacedAt < o.createdAt) ? spot.code : null;
  return {
    order: customerView(o), venue: publicVenue(r.venue), vendor: publicVendor(r.vendor), menuCode,
    venuePhone: r.vendor.phone, invoice: inv ? { id: inv.id, number: inv.number, status: inv.status } : null,
  };
});

import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { route } from '@/lib/api';
import { requireStaff, staffVenueIds } from '@/lib/auth';
import { publicVendor } from '@/lib/menu';
import { featuresOf } from '@/db/schema';

export const GET = route(async () => {
  const s = await requireStaff();
  const ids = await staffVenueIds(s);
  const rows = ids === 'all'
    ? await db().select({ venue: schema.venues, vendor: schema.vendors }).from(schema.venues).innerJoin(schema.vendors, eq(schema.venues.vendorId, schema.vendors.id))
    : ids.length ? await db().select({ venue: schema.venues, vendor: schema.vendors }).from(schema.venues).innerJoin(schema.vendors, eq(schema.venues.vendorId, schema.vendors.id)).where(inArray(schema.venues.id, ids)) : [];
  const station = s.stationId ? (await db().select().from(schema.stations).where(eq(schema.stations.id, s.stationId)))[0] : null;
  return {
    staff: { id: s.id, name: s.name, phone: s.phone, role: s.role, vendorId: s.vendorId, venueId: s.venueId, stationId: s.stationId, stationName: station?.name ?? null },
    venues: rows.map(r => ({ id: r.venue.id, name: r.venue.name, type: r.venue.type, serviceMode: r.venue.serviceMode, vendorId: r.vendor.id, vendor: { ...publicVendor(r.vendor), stage: r.vendor.stage, features: featuresOf(r.vendor) } })),
  };
});

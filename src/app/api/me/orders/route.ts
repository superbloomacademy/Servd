import { desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { route } from '@/lib/api';
import { requireCustomer } from '@/lib/auth';
import { customerView, hydrate } from '@/lib/orders';

// The customer's orders across every venue on the platform.
export const GET = route(async () => {
  const c = await requireCustomer();
  const os = await hydrate(await db().select().from(schema.orders).where(eq(schema.orders.customerId, c.id)).orderBy(desc(schema.orders.createdAt)).limit(50));
  const venueIds = [...new Set(os.map(o => o.venueId))];
  const vs = venueIds.length ? await db().select({ venue: schema.venues, vendor: schema.vendors }).from(schema.venues)
    .innerJoin(schema.vendors, eq(schema.venues.vendorId, schema.vendors.id)).where(inArray(schema.venues.id, venueIds)) : [];
  const info = new Map(vs.map(x => [x.venue.id, { venueName: x.venue.name, brandColor: x.vendor.brandColor, logoUrl: x.vendor.logoUrl, vendorName: x.vendor.name }]));
  return { orders: os.map(o => ({ ...customerView(o), venue: info.get(o.venueId) })) };
});

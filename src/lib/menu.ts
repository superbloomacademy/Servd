import { asc, eq } from 'drizzle-orm';
import { db, schema } from '@/db';

// Full menu for a venue, with live/off state already resolved for customers.
export async function venueMenu(venueId: string) {
  const [cats, its, sts] = await Promise.all([
    db().select().from(schema.categories).where(eq(schema.categories.venueId, venueId)).orderBy(asc(schema.categories.sort)),
    db().select().from(schema.items).where(eq(schema.items.venueId, venueId)).orderBy(asc(schema.items.sort)),
    db().select().from(schema.stations).where(eq(schema.stations.venueId, venueId)).orderBy(asc(schema.stations.sort)),
  ]);
  const stationLive = new Map(sts.map(s => [s.id, s.isLive]));
  const catLive = new Map(cats.map(c => [c.id, c.isLive]));
  return {
    categories: cats.map(c => ({ id: c.id, name: c.name, isLive: c.isLive })),
    items: its.map(i => ({
      id: i.id, categoryId: i.categoryId, name: i.name, description: i.description, pricePaise: i.pricePaise,
      veg: i.veg, imageUrl: i.imageUrl, tags: i.tags,
      available: i.isLive && (catLive.get(i.categoryId) ?? true) && (i.stationId ? stationLive.get(i.stationId) ?? true : true),
    })),
  };
}

export function publicVendor(v: typeof schema.vendors.$inferSelect) {
  return { name: v.name, logoUrl: v.logoUrl, brandColor: v.brandColor, legalName: v.legalName, gstin: v.gstin, fssai: v.fssai, address: v.address };
}
export function publicVenue(v: typeof schema.venues.$inferSelect) {
  return {
    id: v.id, name: v.name, type: v.type, serviceMode: v.serviceMode, city: v.city, taxBps: v.taxBps,
    upiId: v.upiId, upiName: v.upiName, upiQrUrl: v.upiQrUrl, acceptCash: v.settings.acceptCash, unpaidCancelMin: v.settings.unpaidCancelMin,
    openTime: v.openTime, closeTime: v.closeTime,
  };
}

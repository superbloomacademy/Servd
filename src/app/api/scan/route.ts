import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { body, route } from '@/lib/api';
import { getCustomer } from '@/lib/auth';
import { startOrRefreshVisit } from '@/lib/visit';
import { venueMenu, publicVendor, publicVenue } from '@/lib/menu';
import { mostOrdered } from '@/lib/orders';

// Called when the QR page opens. Starts/refreshes the visit and returns everything the menu needs.
export const POST = route(async req => {
  const b = await body<{ code: string; visitId?: string }>(req);
  const customer = await getCustomer();
  const r = await startOrRefreshVisit(String(b.code || ''), b.visitId ?? null, customer?.id ?? null);
  const area = r.spot.areaId ? (await db().select().from(schema.areas).where(eq(schema.areas.id, r.spot.areaId)))[0] : null;
  const [menu, popular, offers] = await Promise.all([
    venueMenu(r.venue.id), mostOrdered(r.venue.id, 8),
    db().select().from(schema.coupons).where(and(eq(schema.coupons.vendorId, r.vendor.id), eq(schema.coupons.active, true))),
  ]);
  return {
    vendor: publicVendor(r.vendor),
    venue: publicVenue(r.venue),
    spot: { label: r.spot.label, kind: r.spot.kind, areaName: area?.name ?? null },
    window: r.window.open
      ? { open: true, until: r.window.until, show: r.window.show }
      : { open: false, reason: r.window.reason, show: r.window.show },
    visit: r.visit ? { id: r.visit.id, expiresAt: r.visit.expiresAt } : null,
    tableSessionId: r.tableSession?.id ?? null,
    menu,
    mostOrdered: popular.map(p => p.itemId),
    offers: offers
      .filter(c => (!c.venueId || c.venueId === r.venue.id) && (!c.expiresAt || c.expiresAt > new Date()) && (!c.usageLimit || c.used < c.usageLimit))
      .map(c => ({ code: c.code, description: c.description, type: c.type, value: c.value, minOrderPaise: c.minOrderPaise })),
    customer: customer ? { name: customer.name, phone: customer.phone } : null,
  };
});

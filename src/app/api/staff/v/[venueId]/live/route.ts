import { and, desc, eq, gte, inArray, or } from 'drizzle-orm';
import { db, schema } from '@/db';
import { route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { hydrate, tableBill } from '@/lib/orders';

// Everything the live screens need: active orders (+ last 12 h), open tables, open requests.
export const GET = route<{ venueId: string }>(async (_req, { venueId }) => {
  const s = await requireVenueAccess(venueId);
  const since = new Date(Date.now() - 12 * 3600e3);
  const active = ['awaiting_payment', 'confirmed', 'preparing', 'ready', 'out'] as const;
  let orders = await hydrate(await db().select().from(schema.orders)
    .where(and(eq(schema.orders.venueId, venueId), or(inArray(schema.orders.status, [...active]), gte(schema.orders.createdAt, since))))
    .orderBy(desc(schema.orders.createdAt)).limit(300));
  // A station only sees orders that have a KOT for it.
  if (s.role === 'station' && s.stationId) orders = orders.filter(o => o.kots.some(k => k.stationId === s.stationId));

  const openTables = await db().select().from(schema.tableSessions)
    .where(and(eq(schema.tableSessions.venueId, venueId), inArray(schema.tableSessions.status, ['open', 'bill_requested'])));
  const tables = await Promise.all(openTables.map(t => tableBill(t.id)));
  const requests = await db().select({ r: schema.serviceRequests, spot: schema.spots }).from(schema.serviceRequests)
    .innerJoin(schema.spots, eq(schema.serviceRequests.spotId, schema.spots.id))
    .where(and(eq(schema.serviceRequests.venueId, venueId), eq(schema.serviceRequests.status, 'open')))
    .orderBy(desc(schema.serviceRequests.createdAt));
  return {
    orders, tables,
    requests: requests.map(x => ({ ...x.r, spotLabel: x.spot.kind === 'table' ? `Table ${x.spot.label}` : x.spot.label })),
  };
});

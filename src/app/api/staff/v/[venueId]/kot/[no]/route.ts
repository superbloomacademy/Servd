import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { bad, notFound, route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { hydrate } from '@/lib/orders';
import { localParts } from '@/lib/util';

// Counter staff type the KOT number the customer shows them.
export const GET = route<{ venueId: string; no: string }>(async (_req, { venueId, no }) => {
  await requireVenueAccess(venueId);
  const n = Number(no);
  if (!Number.isInteger(n) || n < 1) throw bad('Enter a KOT number');
  const today = localParts().date;
  const o = await db().select().from(schema.orders)
    .where(and(eq(schema.orders.venueId, venueId), eq(schema.orders.businessDate, today), eq(schema.orders.kotNo, n)))
    .orderBy(desc(schema.orders.createdAt)).limit(1);
  if (!o[0]) throw notFound(`No order with KOT ${n} today.`);
  return { order: (await hydrate(o))[0] };
});

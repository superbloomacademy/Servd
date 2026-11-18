import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { body, notFound, route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { CAN } from '@/lib/roles';
import { cancelItem } from '@/lib/pos';

// Cancel (part of) one line after the KOT went to the kitchen. A reason is required and shows in the day-end report.
export const POST = route<{ id: string }>(async (req, { id }) => {
  const it = /^[0-9a-f-]{36}$/.test(id) ? (await db().select({ orderId: schema.orderItems.orderId }).from(schema.orderItems).where(eq(schema.orderItems.id, id)))[0] : null;
  if (!it) throw notFound('Item not found');
  const o = (await db().select({ venueId: schema.orders.venueId }).from(schema.orders).where(eq(schema.orders.id, it.orderId)))[0];
  const s = await requireVenueAccess(o.venueId, CAN.cancelItem);
  const b = await body<{ qty?: number; reason?: string }>(req);
  return { order: await cancelItem(id, Number(b.qty) || 1, String(b.reason || ''), s) };
});

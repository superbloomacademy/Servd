import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { body, route } from '@/lib/api';
import { requireCustomer } from '@/lib/auth';
import { requireValidVisit } from '@/lib/visit';
import { createOrder, customerView, getFullOrder } from '@/lib/orders';

const Input = z.object({
  visitId: z.string(),
  lines: z.array(z.object({ itemId: z.string(), qty: z.number().int().min(1).max(30) })).min(1, 'Your cart is empty.').max(40),
  couponCode: z.string().max(30).nullish(),
  deliverAt: z.enum(['now', 'interval']).optional(),
  note: z.string().max(200).optional(),
  payMethod: z.enum(['upi_shop', 'cash']).optional(),
});

export const POST = route(async req => {
  const customer = await requireCustomer();
  const b = Input.parse(await body(req));
  const v = await requireValidVisit(b.visitId, customer.id);
  const area = v.spot.areaId ? (await db().select().from(schema.areas).where(eq(schema.areas.id, v.spot.areaId)))[0] : null;
  const show = v.window.show;
  const order = await createOrder({
    venue: v.venue, vendorId: v.vendor.id, visit: v.visit, spot: v.spot, tableSession: v.tableSession,
    showLabel: show ? `${show.movie} · ${show.time}` : null, intervalAt: show?.intervalAt ?? null,
    customer, lines: b.lines, couponCode: b.couponCode, deliverAt: b.deliverAt, note: b.note, payMethod: b.payMethod,
    areaName: v.spot.kind === 'seat' ? area?.name : null,
  });
  return { order: customerView(await getFullOrder(order.id)) };
});

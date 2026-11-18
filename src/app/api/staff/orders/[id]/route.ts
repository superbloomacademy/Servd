import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { bad, body, forbidden, notFound, route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { CAN } from '@/lib/roles';
import { confirmPayment, rejectOrder, staffAdvance } from '@/lib/orders';
import { applyDiscount, settleOrder, type Discount } from '@/lib/pos';
import type { Payment, StaffRole } from '@/db/schema';

type Action = 'confirm_payment' | 'preparing' | 'ready' | 'out' | 'delivered' | 'reject' | 'settle' | 'discount';
const NEED: Record<Action, StaffRole[]> = {
  confirm_payment: CAN.confirmPayment, preparing: CAN.cook, ready: CAN.cook, out: CAN.deliver, delivered: CAN.deliver, reject: CAN.reject,
  settle: CAN.settle, discount: CAN.discount,
};

export const POST = route<{ id: string }>(async (req, { id }) => {
  const b = await body<{ action: Action; reason?: string; payments?: Payment[]; discount?: Discount }>(req);
  if (!NEED[b.action]) throw bad('Unknown action');
  const o = /^[0-9a-f-]{36}$/.test(id) ? (await db().select().from(schema.orders).where(eq(schema.orders.id, id)))[0] : null;
  if (!o) throw notFound('Order not found');
  const s = await requireVenueAccess(o.venueId);
  if (s.role !== 'super_admin' && !NEED[b.action].includes(s.role)) throw forbidden('Your role cannot do this.');
  if (b.action === 'confirm_payment') return { order: await confirmPayment(id, s) };
  if (b.action === 'reject') return { order: await rejectOrder(id, String(b.reason || ''), s) };
  if (b.action === 'settle') return { order: await settleOrder(id, Array.isArray(b.payments) ? b.payments : [], s) };
  if (b.action === 'discount') {
    if (!b.discount) throw bad('Enter a discount');
    await applyDiscount({ orderId: id }, b.discount, s);
    return { ok: true };
  }
  return { order: await staffAdvance(id, b.action, s) };
});

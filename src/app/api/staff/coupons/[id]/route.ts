import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { bad, body, forbidden, notFound, route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { CAN } from '@/lib/roles';
import { audit } from '@/lib/audit';

async function load(id: string) {
  const s = await requireStaff(CAN.coupons);
  const c = /^[0-9a-f-]{36}$/.test(id) ? (await db().select().from(schema.coupons).where(eq(schema.coupons.id, id)))[0] : null;
  if (!c) throw notFound('Coupon not found');
  if (s.role !== 'super_admin' && s.vendorId !== c.vendorId) throw forbidden();
  return { s, c };
}

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const { s, c } = await load(id);
  const b = await body<{ active?: boolean }>(req);
  if (typeof b.active !== 'boolean') throw bad('Nothing to change');
  await db().update(schema.coupons).set({ active: b.active }).where(eq(schema.coupons.id, id));
  await audit(s, { action: b.active ? 'coupon_turned_on' : 'coupon_turned_off', entity: 'coupon', entityId: id, vendorId: c.vendorId, after: { code: c.code } });
  return { ok: true };
});

export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  const { s, c } = await load(id);
  await db().delete(schema.coupons).where(eq(schema.coupons.id, id));
  await audit(s, { action: 'coupon_deleted', entity: 'coupon', entityId: id, vendorId: c.vendorId, before: c });
  return { ok: true };
});

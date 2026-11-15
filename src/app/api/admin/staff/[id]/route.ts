import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { bad, body, notFound, route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { hashPin } from '@/lib/util';

const Act = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reset_pin'), pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4–6 digits') }),
  z.object({ action: z.literal('set_active'), active: z.boolean() }),
]);

// Super admin support actions on any vendor login: reset a forgotten PIN, turn a login off/on.
export const POST = route<{ id: string }>(async (req, { id }) => {
  const s = await requireStaff(['super_admin']);
  const m = /^[0-9a-f-]{36}$/.test(id) ? (await db().select().from(schema.staff).where(eq(schema.staff.id, id)))[0] : null;
  if (!m) throw notFound('Login not found');
  if (m.role === 'super_admin') throw bad('Super admin logins can’t be changed here.');
  const b = Act.parse(await body(req));
  if (b.action === 'reset_pin') {
    await db().update(schema.staff).set({ pinHash: hashPin(b.pin) }).where(eq(schema.staff.id, id));
    await db().delete(schema.sessions).where(eq(schema.sessions.staffId, id));   // log out everywhere
    await audit(s, { action: 'pin_reset', entity: 'staff', entityId: id, vendorId: m.vendorId, venueId: m.venueId, after: { name: m.name, phone: m.phone } });
  } else {
    await db().update(schema.staff).set({ active: b.active }).where(eq(schema.staff.id, id));
    if (!b.active) await db().delete(schema.sessions).where(eq(schema.sessions.staffId, id));
    await audit(s, { action: b.active ? 'login_turned_on' : 'login_turned_off', entity: 'staff', entityId: id, vendorId: m.vendorId, venueId: m.venueId, after: { name: m.name } });
  }
  return { ok: true };
});

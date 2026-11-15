import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { bad, body, forbidden, notFound, route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { CAN } from '@/lib/roles';
import { audit } from '@/lib/audit';
import { hashPin } from '@/lib/util';

// Turn a login on/off or reset its PIN.
export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const s = await requireStaff(CAN.team);
  const m = /^[0-9a-f-]{36}$/.test(id) ? (await db().select().from(schema.staff).where(eq(schema.staff.id, id)))[0] : null;
  if (!m) throw notFound('Staff member not found');
  if (s.role !== 'super_admin' && (m.vendorId !== s.vendorId || m.role === 'owner')) throw forbidden();
  const b = await body<{ active?: boolean; pin?: string }>(req);
  const set: Partial<typeof schema.staff.$inferInsert> = {};
  if (typeof b.active === 'boolean') set.active = b.active;
  if (b.pin !== undefined) { if (!/^\d{4,6}$/.test(String(b.pin))) throw bad('PIN must be 4–6 digits'); set.pinHash = hashPin(String(b.pin)); }
  if (!Object.keys(set).length) throw bad('Nothing to change');
  await db().update(schema.staff).set(set).where(eq(schema.staff.id, id));
  if (set.active === false || set.pinHash) await db().delete(schema.sessions).where(eq(schema.sessions.staffId, id)); // log them out
  await audit(s, { action: set.pinHash ? 'staff_pin_reset' : set.active ? 'staff_enabled' : 'staff_disabled', entity: 'staff', entityId: id, vendorId: m.vendorId, venueId: m.venueId, after: { name: m.name } });
  return { ok: true };
});

import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { bad, body, forbidden, route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { CAN } from '@/lib/roles';
import { audit } from '@/lib/audit';
import { cleanPhone, hashPin } from '@/lib/util';
import { vendorIdFor } from '@/lib/vendor-access';

export const GET = route(async req => {
  const s = await requireStaff(CAN.team);
  const vendorId = vendorIdFor(s, req);
  const rows = await db().select().from(schema.staff).where(and(eq(schema.staff.vendorId, vendorId), ne(schema.staff.role, 'super_admin')));
  return { team: rows.map(({ pinHash: _p, ...r }) => r) };
});

const New = z.object({
  vendorId: z.string().optional(),
  name: z.string().trim().min(2, 'Enter a name').max(40), phone: z.string(), pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4–6 digits'),
  role: z.enum(['manager', 'cashier', 'station', 'captain', 'runner']),
  venueId: z.string().uuid(), stationId: z.string().uuid().nullish(),
});

export const POST = route(async req => {
  const s = await requireStaff(CAN.team);
  const b = New.parse(await body(req));
  const vendorId = vendorIdFor(s, req, b.vendorId);
  const phone = cleanPhone(b.phone);
  if (!phone) throw bad('Enter a valid 10-digit mobile number');
  const venue = (await db().select().from(schema.venues).where(eq(schema.venues.id, b.venueId)))[0];
  if (!venue || venue.vendorId !== vendorId) throw forbidden();
  if (b.role === 'station' && !b.stationId) throw bad('Choose which station this login is for.');
  if ((await db().select().from(schema.staff).where(eq(schema.staff.phone, phone)))[0]) throw bad('This phone number already has a staff login.');
  const [m] = await db().insert(schema.staff).values({
    name: b.name, phone, pinHash: hashPin(b.pin), role: b.role, vendorId, venueId: b.venueId, stationId: b.role === 'station' ? b.stationId : null,
  }).returning();
  await audit(s, { action: 'staff_added', entity: 'staff', entityId: m.id, vendorId, venueId: b.venueId, after: { name: m.name, role: m.role, phone } });
  const { pinHash: _p, ...out } = m;
  return { member: out };
});

import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { bad, body, forbidden, notFound, route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { CAN } from '@/lib/roles';
import { setKotStatus } from '@/lib/orders';

export const POST = route<{ id: string }>(async (req, { id }) => {
  const b = await body<{ status: 'preparing' | 'ready' }>(req);
  if (!['preparing', 'ready'].includes(b.status)) throw bad('Unknown status');
  const k = /^[0-9a-f-]{36}$/.test(id) ? (await db().select().from(schema.kots).where(eq(schema.kots.id, id)))[0] : null;
  if (!k) throw notFound('KOT not found');
  const s = await requireVenueAccess(k.venueId, CAN.cook);
  if (s.role === 'station' && s.stationId && k.stationId !== s.stationId) throw forbidden('This KOT belongs to another station.');
  return { order: await setKotStatus(id, b.status, s) };
});

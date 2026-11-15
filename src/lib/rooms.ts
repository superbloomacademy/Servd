// Who may listen to which live room. Checked once when a screen joins (POST /api/rt/join).
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { customerFromToken, staffFromToken, staffCanAccessVenue, CUSTOMER_COOKIE, STAFF_COOKIE } from './auth';

export async function canJoinRoom(room: string, cookies: Record<string, string | undefined>) {
  const [kind, id] = room.split(':');
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return false;
  if (kind === 'menu') return true; // public: item live/off changes

  if (kind === 'venue' || kind === 'station') {
    const s = await staffFromToken(cookies[STAFF_COOKIE]);
    if (!s) return false;
    let venueId = id;
    if (kind === 'station') {
      const st = await db().select().from(schema.stations).where(eq(schema.stations.id, id));
      if (!st[0]) return false;
      venueId = st[0].venueId;
    }
    return staffCanAccessVenue(s, venueId);
  }

  const c = await customerFromToken(cookies[CUSTOMER_COOKIE]);
  if (!c) return false;
  if (kind === 'order') {
    const o = await db().select({ id: schema.orders.id }).from(schema.orders)
      .where(and(eq(schema.orders.id, id), eq(schema.orders.customerId, c.id)));
    return !!o[0];
  }
  if (kind === 'table') {
    const v = await db().select({ id: schema.visits.id }).from(schema.visits)
      .where(and(eq(schema.visits.tableSessionId, id), eq(schema.visits.customerId, c.id)));
    return !!v[0];
  }
  return false;
}

import { cookies } from 'next/headers';
import { sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { body, route } from '@/lib/api';
import { canJoinRoom } from '@/lib/rooms';
import { signRooms } from '@/lib/realtime';

// A screen says which live rooms it wants. We check each one once and hand back a signed pass + where to start reading.
export const POST = route(async req => {
  const b = await body<{ rooms?: unknown }>(req);
  const list = Array.isArray(b.rooms) ? [...new Set(b.rooms.filter((r): r is string => typeof r === 'string'))].slice(0, 20) : [];
  const jar = Object.fromEntries((await cookies()).getAll().map(c => [c.name, c.value]));
  const ok: string[] = [];
  for (const r of list) if (await canJoinRoom(r, jar).catch(() => false)) ok.push(r);
  const last = (await db().select({ id: sql<number>`coalesce(max(${schema.rtEvents.id}), 0)::bigint` }).from(schema.rtEvents))[0].id;
  return { token: signRooms(ok), rooms: ok, cursor: Number(last) };
});

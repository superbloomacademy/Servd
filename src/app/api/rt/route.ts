import { and, asc, gt, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { ApiError, route } from '@/lib/api';
import { readRooms } from '@/lib/realtime';
import { maybeRunJobs } from '@/lib/jobs';

export const dynamic = 'force-dynamic';

// New live events for the rooms on the pass, after `since`. Called every ~1.5 s by open screens,
// which also keeps the background jobs (auto-cancel, interval orders) running on serverless hosts.
export const GET = route(async req => {
  const p = new URL(req.url).searchParams;
  const rooms = readRooms(p.get('t'));
  if (!rooms) throw new ApiError(401, 'Pass expired', 'rejoin');
  const since = Math.max(0, Number(p.get('since')) || 0);
  await maybeRunJobs();
  if (!rooms.length) return { events: [], cursor: since };
  const rows = await db().select().from(schema.rtEvents)
    .where(and(gt(schema.rtEvents.id, since), sql`${schema.rtEvents.rooms} && ${`{${rooms.map(r => `"${r}"`).join(',')}}`}::text[]`))
    .orderBy(asc(schema.rtEvents.id)).limit(200);
  const cursor = rows.length ? rows[rows.length - 1].id : since;
  return new Response(JSON.stringify({ events: rows.map(r => ({ id: r.id, rooms: r.rooms, event: r.event, data: r.data })), cursor }),
    { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
});

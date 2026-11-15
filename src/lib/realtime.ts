// Live updates that work everywhere, including Vercel (no always-open connections needed).
// emit() saves an event row; screens ask GET /api/rt for new rows every ~1.5 s (see useRealtime in lib/client.ts).
// Rooms:
//   venue:<id>          staff of a venue (orders, payments, requests)
//   station:<id>        one kitchen/stall station's KOT screen
//   menu:<venueId>      customers looking at a venue's menu (live/off changes)
//   order:<id>          the customer who placed an order
//   table:<id>          everyone at a table session (shared bill)
import crypto from 'node:crypto';
import { db, schema } from '@/db';

const g = globalThis as unknown as { __servdPending?: Set<Promise<unknown>> };
const pending = () => (g.__servdPending ??= new Set());

/** Save a live event. The API wrapper waits for it before answering, so nothing is lost on serverless hosts. */
export function emit(rooms: string | string[], event: string, data: unknown) {
  const list = [...new Set(Array.isArray(rooms) ? rooms : [rooms])].filter(Boolean);
  if (!list.length) return;
  const p = db().insert(schema.rtEvents).values({ rooms: list, event, data: (data ?? null) as object })
    .catch(e => console.error('[realtime] could not save event', e))
    .finally(() => pending().delete(p));
  pending().add(p);
}

/** Wait for events emitted while handling this request. */
export async function flushEmits() {
  const ps = [...pending()];
  if (ps.length) await Promise.allSettled(ps);
}

// ---- signed "room pass": which rooms a screen may listen to, checked once, then trusted for 12 hours
function secret() {
  return process.env.APP_SECRET || crypto.createHash('sha256').update(`servd:${process.env.DATABASE_URL || 'local'}`).digest('hex');
}
export function signRooms(rooms: string[]) {
  const body = Buffer.from(JSON.stringify({ r: rooms, e: Date.now() + 12 * 3600e3 })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}
export function readRooms(token: string | null): string[] | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const { r, e } = JSON.parse(Buffer.from(body, 'base64url').toString());
    return Array.isArray(r) && typeof e === 'number' && e > Date.now() ? r : null;
  } catch { return null; }
}

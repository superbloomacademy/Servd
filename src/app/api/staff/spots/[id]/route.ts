import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { bad, body, notFound, route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { CAN } from '@/lib/roles';
import { audit } from '@/lib/audit';
import { randomCode } from '@/lib/util';

async function load(id: string) {
  const sp = /^[0-9a-f-]{36}$/.test(id) ? (await db().select().from(schema.spots).where(eq(schema.spots.id, id)))[0] : null;
  if (!sp) throw notFound('Seat or table not found');
  return sp;
}

// Switch a seat/table QR on or off.
export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const sp = await load(id);
  const s = await requireVenueAccess(sp.venueId, CAN.spots);
  const b = await body<{ active?: boolean }>(req);
  if (typeof b.active !== 'boolean') throw bad('Nothing to change');
  await db().update(schema.spots).set({ active: b.active }).where(eq(schema.spots.id, id));
  await audit(s, { action: b.active ? 'qr_turned_on' : 'qr_turned_off', entity: 'spot', entityId: id, venueId: sp.venueId, after: { label: sp.label } });
  return { ok: true };
});

// Replace the secret code: the old sticker stops working immediately.
export const POST = route<{ id: string }>(async (req, { id }) => {
  const sp = await load(id);
  const s = await requireVenueAccess(sp.venueId, CAN.spots);
  const b = await body<{ action: string }>(req);
  if (b.action !== 'replace_code') throw bad('Unknown action');
  const code = randomCode();
  await db().update(schema.spots).set({ code, codeReplacedAt: new Date() }).where(eq(schema.spots.id, id));
  await db().update(schema.visits).set({ expiresAt: new Date() }).where(eq(schema.visits.spotId, id));
  await audit(s, { action: 'qr_code_replaced', entity: 'spot', entityId: id, venueId: sp.venueId, after: { label: sp.label } });
  return { ok: true };
});

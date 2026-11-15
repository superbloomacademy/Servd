import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { body, notFound, route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { CAN } from '@/lib/roles';
import { audit } from '@/lib/audit';
import { randomCode } from '@/lib/util';

async function load(id: string) {
  const a = /^[0-9a-f-]{36}$/.test(id) ? (await db().select().from(schema.areas).where(eq(schema.areas.id, id)))[0] : null;
  if (!a) throw notFound('Area not found');
  return a;
}

const Patch = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  shows: z.array(z.object({
    time: z.string().regex(/^\d{1,2}:\d{2}$/, 'Show time must look like 18:30'), movie: z.string().trim().min(1).max(80),
    durationMin: z.number().int().min(30).max(300), intervalAfterMin: z.number().int().min(10).max(250),
  })).max(20).optional(),
  addTables: z.array(z.string().trim().min(1).max(10)).max(100).optional(),
});

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const a = await load(id);
  const s = await requireVenueAccess(a.venueId, CAN.spots);
  const b = Patch.parse(await body(req));
  if (b.name) await db().update(schema.areas).set({ name: b.name }).where(eq(schema.areas.id, id));
  if (b.shows) {
    await db().delete(schema.shows).where(eq(schema.shows.areaId, id));
    if (b.shows.length) await db().insert(schema.shows).values(b.shows.map(x => ({ ...x, time: x.time.padStart(5, '0'), venueId: a.venueId, areaId: id })));
  }
  if (b.addTables?.length) {
    const existing = new Set((await db().select().from(schema.spots).where(eq(schema.spots.areaId, id))).map(x => x.label));
    const add = b.addTables.filter(l => !existing.has(l));
    if (add.length) await db().insert(schema.spots).values(add.map((l, i) => ({ venueId: a.venueId, areaId: id, label: l, kind: 'table' as const, code: randomCode(), sort: 100 + i })));
  }
  await audit(s, { action: 'area_edited', entity: 'area', entityId: id, venueId: a.venueId, after: b });
  return { ok: true };
});

export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  const a = await load(id);
  const s = await requireVenueAccess(a.venueId, CAN.spots);
  // Spots with orders can't be hard-deleted; switch them off instead.
  await db().update(schema.spots).set({ active: false }).where(eq(schema.spots.areaId, id));
  await audit(s, { action: 'area_disabled', entity: 'area', entityId: id, venueId: a.venueId, before: a });
  return { ok: true };
});

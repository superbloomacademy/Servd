import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { bad, body, route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { CAN } from '@/lib/roles';
import { audit } from '@/lib/audit';
import { parseRows, randomCode } from '@/lib/util';

export const GET = route<{ venueId: string }>(async (_req, { venueId }) => {
  await requireVenueAccess(venueId);
  const [areas, spots, shows] = await Promise.all([
    db().select().from(schema.areas).where(eq(schema.areas.venueId, venueId)).orderBy(asc(schema.areas.sort)),
    db().select().from(schema.spots).where(eq(schema.spots.venueId, venueId)).orderBy(asc(schema.spots.sort)),
    db().select().from(schema.shows).where(eq(schema.shows.venueId, venueId)).orderBy(asc(schema.shows.time)),
  ]);
  return { areas: areas.map(a => ({ ...a, shows: shows.filter(s => s.areaId === a.id) })), spots };
});

const NewArea = z.object({
  name: z.string().trim().min(1, 'Give it a name').max(40),
  kind: z.enum(['screen', 'tables', 'counter']),
  rows: z.string().max(20).optional(), seatsPerRow: z.number().int().min(1).max(80).optional(),
  labels: z.array(z.string().trim().min(1).max(10)).max(200).optional(),
});

// Add a screen (seats generated from rows × seats per row), a group of tables, or a counter QR.
export const POST = route<{ venueId: string }>(async (req, { venueId }) => {
  const s = await requireVenueAccess(venueId, CAN.spots);
  const b = NewArea.parse(await body(req));
  const [area] = await db().insert(schema.areas).values({ venueId, name: b.name, rows: b.kind === 'screen' ? b.rows : null, seatsPerRow: b.kind === 'screen' ? b.seatsPerRow : null, sort: 99 }).returning();
  let vals: (typeof schema.spots.$inferInsert)[] = [];
  if (b.kind === 'screen') {
    const rows = parseRows(b.rows);
    if (!rows.length || !b.seatsPerRow) throw bad('Enter rows like A-J and seats per row.');
    let i = 0;
    for (const r of rows) for (let n = 1; n <= b.seatsPerRow; n++) vals.push({ venueId, areaId: area.id, label: `${r}${n}`, kind: 'seat', code: randomCode(), sort: i++ });
  } else if (b.kind === 'tables') {
    const labels = [...new Set(b.labels || [])];
    if (!labels.length) throw bad('Enter table numbers, e.g. 1-10 or T1, T2, T3.');
    vals = labels.map((l, i) => ({ venueId, areaId: area.id, label: l, kind: 'table' as const, code: randomCode(), sort: i }));
  } else {
    vals = [{ venueId, areaId: area.id, label: b.name, kind: 'shop', code: randomCode() }];
  }
  await db().insert(schema.spots).values(vals);
  await audit(s, { action: 'area_created', entity: 'area', entityId: area.id, venueId, after: { name: b.name, kind: b.kind, spots: vals.length } });
  return { area, created: vals.length };
});

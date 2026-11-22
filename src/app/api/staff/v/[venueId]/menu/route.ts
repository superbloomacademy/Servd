import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { body, route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { CAN } from '@/lib/roles';
import { audit } from '@/lib/audit';
import { emit } from '@/lib/realtime';
import { cleanOptions, freeCode } from '@/lib/menu';
import { bad } from '@/lib/api';

export const GET = route<{ venueId: string }>(async (_req, { venueId }) => {
  await requireVenueAccess(venueId);
  const [categories, items, stations] = await Promise.all([
    db().select().from(schema.categories).where(eq(schema.categories.venueId, venueId)).orderBy(asc(schema.categories.sort)),
    db().select().from(schema.items).where(eq(schema.items.venueId, venueId)).orderBy(asc(schema.items.sort)),
    db().select().from(schema.stations).where(eq(schema.stations.venueId, venueId)).orderBy(asc(schema.stations.sort)),
  ]);
  // Menu order everywhere: by category, then as arranged inside it.
  const at = new Map(categories.map((c, i) => [c.id, i]));
  items.sort((a, b) => (at.get(a.categoryId) ?? 999) - (at.get(b.categoryId) ?? 999) || a.sort - b.sort || a.name.localeCompare(b.name));
  return { categories, items, stations };
});

const Item = z.object({
  type: z.literal('item'), categoryId: z.string().uuid(), stationId: z.string().uuid().nullish(),
  name: z.string().trim().min(2, 'Item name is too short').max(80), description: z.string().max(200).default(''),
  pricePaise: z.number().int().min(100, 'Price must be at least ₹1').max(10000000), veg: z.boolean().default(true),
  imageUrl: z.string().max(300).nullish(), tags: z.array(z.string().max(20)).max(5).default([]),
  variants: z.array(z.unknown()).max(8).default([]), addonGroups: z.array(z.unknown()).max(6).default([]),
  shortCode: z.string().max(10).default(''), favourite: z.boolean().default(false),
});
const Named = z.object({ type: z.enum(['category', 'station']), name: z.string().trim().min(2, 'Name is too short').max(40) });

export const POST = route<{ venueId: string }>(async (req, { venueId }) => {
  const s = await requireVenueAccess(venueId, CAN.editMenu);
  const raw = await body<{ type: string }>(req);
  let row: unknown;
  if (raw.type === 'item') {
    const b = Item.parse(raw);
    let opts;
    try { opts = cleanOptions(b.variants, b.addonGroups); } catch (e) { throw bad((e as Error).message); }
    [row] = await db().insert(schema.items).values({ venueId, categoryId: b.categoryId, stationId: b.stationId ?? null, name: b.name,
      description: b.description, pricePaise: opts.minPrice ?? b.pricePaise, veg: b.veg, imageUrl: b.imageUrl ?? null, tags: b.tags, sort: 999,
      variants: opts.variants, addonGroups: opts.addonGroups, shortCode: await freeCode(venueId, b.shortCode), favourite: b.favourite }).returning();
  } else {
    const b = Named.parse(raw);
    const table = b.type === 'category' ? schema.categories : schema.stations;
    [row] = await db().insert(table).values({ venueId, name: b.name, sort: 999 }).returning();
  }
  await audit(s, { action: `${raw.type}_created`, entity: raw.type, venueId, after: row });
  emit(`menu:${venueId}`, 'menu', {});
  return { row };
});

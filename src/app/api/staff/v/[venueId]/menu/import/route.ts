import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { body, route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { CAN } from '@/lib/roles';
import { audit } from '@/lib/audit';
import { emit } from '@/lib/realtime';

const Row = z.object({
  category: z.string().trim().min(1).max(40), name: z.string().trim().min(2).max(80), pricePaise: z.number().int().min(100).max(10000000),
  veg: z.boolean().default(true), station: z.string().trim().max(40).default(''), description: z.string().trim().max(200).default(''),
});
const Input = z.object({ rows: z.array(Row).min(1, 'The file has no items.').max(1000, 'At most 1000 items at a time.') });

// Bulk menu upload (from an Excel sheet saved as CSV). New categories / stations are created;
// an item with the same name in the same category gets its price, type and description updated.
export const POST = route<{ venueId: string }>(async (req, { venueId }) => {
  const s = await requireVenueAccess(venueId, CAN.editMenu);
  const { rows } = Input.parse(await body(req));
  let added = 0, updated = 0;
  await db().transaction(async tx => {
    const cats = await tx.select().from(schema.categories).where(eq(schema.categories.venueId, venueId));
    const sts = await tx.select().from(schema.stations).where(eq(schema.stations.venueId, venueId));
    const find = <T extends { name: string }>(list: T[], n: string) => list.find(x => x.name.trim().toLowerCase() === n.toLowerCase());
    for (const r of rows) {
      let c = find(cats, r.category);
      if (!c) { [c] = await tx.insert(schema.categories).values({ venueId, name: r.category, sort: cats.length }).returning(); cats.push(c); }
      let st = r.station ? find(sts, r.station) : undefined;
      if (r.station && !st) { [st] = await tx.insert(schema.stations).values({ venueId, name: r.station, sort: sts.length }).returning(); sts.push(st); }
      const ex = (await tx.select().from(schema.items).where(and(eq(schema.items.venueId, venueId), eq(schema.items.categoryId, c.id))))
        .find(i => i.name.trim().toLowerCase() === r.name.toLowerCase());
      if (ex) {
        await tx.update(schema.items).set({ pricePaise: ex.variants.length ? ex.pricePaise : r.pricePaise, veg: r.veg, ...(r.description ? { description: r.description } : {}), ...(st ? { stationId: st.id } : {}) })
          .where(eq(schema.items.id, ex.id));
        updated++;
      } else {
        await tx.insert(schema.items).values({ venueId, categoryId: c.id, stationId: st?.id ?? sts[0]?.id ?? null, name: r.name, pricePaise: r.pricePaise, veg: r.veg, description: r.description, sort: 900 + added });
        added++;
      }
    }
  });
  await audit(s, { action: 'menu_imported', entity: 'menu', venueId, after: { added, updated } });
  emit([`menu:${venueId}`, `venue:${venueId}`], 'menu', {});
  return { added, updated };
});

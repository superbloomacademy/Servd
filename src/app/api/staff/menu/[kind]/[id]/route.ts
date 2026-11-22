import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { bad, body, forbidden, notFound, route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { CAN } from '@/lib/roles';
import { audit } from '@/lib/audit';
import { emit } from '@/lib/realtime';
import { cleanOptions } from '@/lib/menu';

const TABLES = { item: schema.items, category: schema.categories, station: schema.stations } as const;
type Kind = keyof typeof TABLES;

async function load(kind: string, id: string) {
  if (!(kind in TABLES) || !/^[0-9a-f-]{36}$/.test(id)) throw notFound();
  const t = TABLES[kind as Kind];
  const row = (await db().select().from(t).where(eq(t.id, id)))[0] as Record<string, unknown> & { venueId: string; stationId?: string | null };
  if (!row) throw notFound();
  return { t, row };
}

// Edit an item / category / station. Only the Live/Off switch is open to station & counter staff.
export const PATCH = route<{ kind: string; id: string }>(async (req, { kind, id }) => {
  const { t, row } = await load(kind, id);
  const b = await body<Record<string, unknown>>(req);
  const onlyLive = Object.keys(b).length === 1 && 'isLive' in b;
  const s = await requireVenueAccess(row.venueId, onlyLive ? CAN.toggleLive : CAN.editMenu);
  if (onlyLive && s.role === 'station' && s.stationId) {
    const own = kind === 'item' ? row.stationId === s.stationId : kind === 'station' ? row.id === s.stationId : false;
    if (!own) throw forbidden('You can switch off only your own station’s items.');
  }
  const set: Record<string, unknown> = {};
  if ('isLive' in b) { set.isLive = !!b.isLive; if (kind === 'item') set.stockOff = false; }
  if (!onlyLive) {
    for (const k of ['name', 'description', 'imageUrl']) if (k in b) set[k] = b[k] === null ? null : String(b[k]).slice(0, 300);
    if ('name' in set && String(set.name).trim().length < 2) throw bad('Name is too short');
    if ('pricePaise' in b) { const p = Number(b.pricePaise); if (!Number.isInteger(p) || p < 100) throw bad('Price must be at least ₹1'); set.pricePaise = p; }
    if ('veg' in b) set.veg = !!b.veg;
    if ('tags' in b && Array.isArray(b.tags)) set.tags = (b.tags as unknown[]).map(String).slice(0, 5);
    if ('categoryId' in b) set.categoryId = String(b.categoryId);
    if ('stationId' in b) set.stationId = b.stationId ? String(b.stationId) : null;
    if ('sort' in b) set.sort = Number(b.sort) || 0;
    if (kind === 'item' && ('variants' in b || 'addonGroups' in b)) {
      let o;
      try { o = cleanOptions('variants' in b ? b.variants : row.variants, 'addonGroups' in b ? b.addonGroups : row.addonGroups); } catch (e) { throw bad((e as Error).message); }
      set.variants = o.variants; set.addonGroups = o.addonGroups;
      if (o.minPrice) set.pricePaise = o.minPrice;
    }
  }
  if (!Object.keys(set).length) throw bad('Nothing to change');
  const [after] = await db().update(t).set(set).where(eq(t.id, id)).returning();
  await audit(s, { action: onlyLive ? (set.isLive ? `${kind}_turned_on` : `${kind}_turned_off`) : `${kind}_edited`, entity: kind, entityId: id,
    venueId: row.venueId, before: Object.fromEntries(Object.keys(set).map(k => [k, row[k]])), after: set });
  emit([`menu:${row.venueId}`, `venue:${row.venueId}`], 'menu', { kind, id, ...set });
  return { row: after };
});

export const DELETE = route<{ kind: string; id: string }>(async (_req, { kind, id }) => {
  const { t, row } = await load(kind, id);
  const s = await requireVenueAccess(row.venueId, CAN.editMenu);
  await db().delete(t).where(eq(t.id, id));
  await audit(s, { action: `${kind}_deleted`, entity: kind, entityId: id, venueId: row.venueId, before: row });
  emit([`menu:${row.venueId}`, `venue:${row.venueId}`], 'menu', { kind, id, deleted: true });
  return { ok: true };
});

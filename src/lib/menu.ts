import { z } from 'zod';
import { randomCode } from './util';
import { and, asc, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { bad } from './api';

// Full menu for a venue, with live/off state already resolved for customers.
export async function venueMenu(venueId: string) {
  const [cats, its, sts] = await Promise.all([
    db().select().from(schema.categories).where(eq(schema.categories.venueId, venueId)).orderBy(asc(schema.categories.sort)),
    db().select().from(schema.items).where(eq(schema.items.venueId, venueId)).orderBy(asc(schema.items.sort)),
    db().select().from(schema.stations).where(eq(schema.stations.venueId, venueId)).orderBy(asc(schema.stations.sort)),
  ]);
  const stationLive = new Map(sts.map(s => [s.id, s.isLive]));
  const catLive = new Map(cats.map(c => [c.id, c.isLive]));
  return {
    categories: cats.map(c => ({ id: c.id, name: c.name, isLive: c.isLive })),
    items: its.map(i => ({
      id: i.id, categoryId: i.categoryId, name: i.name, description: i.description, pricePaise: i.pricePaise,
      veg: i.veg, imageUrl: i.imageUrl, tags: i.tags, variants: i.variants, addonGroups: i.addonGroups,
      available: i.isLive && (catLive.get(i.categoryId) ?? true) && (i.stationId ? stationLive.get(i.stationId) ?? true : true),
    })),
  };
}

export function publicVendor(v: typeof schema.vendors.$inferSelect) {
  return { name: v.name, logoUrl: v.logoUrl, brandColor: v.brandColor, legalName: v.legalName, gstin: v.gstin, fssai: v.fssai, address: v.address, isDemo: v.isDemo };
}
export function publicVenue(v: typeof schema.venues.$inferSelect) {
  return {
    id: v.id, name: v.name, type: v.type, serviceMode: v.serviceMode, city: v.city, taxBps: v.taxBps,
    upiId: v.upiId, upiName: v.upiName, upiQrUrl: v.upiQrUrl, acceptCash: v.settings.acceptCash, unpaidCancelMin: v.settings.unpaidCancelMin,
    openTime: v.openTime, closeTime: v.closeTime,
  };
}

// ---------------------------------------------------------------- sizes & add-ons (checked on every save)
const optId = z.string().regex(/^[a-z0-9]{3,20}$/).optional();
const Variants = z.array(z.object({ id: optId, name: z.string().trim().min(1, 'Name each size').max(30), pricePaise: z.number().int().min(100, 'Each size needs a price of at least ₹1').max(10000000) })).max(8);
const Groups = z.array(z.object({
  id: optId, name: z.string().trim().min(2, 'Name each add-on group').max(40), min: z.number().int().min(0).max(10), max: z.number().int().min(0).max(20),
  options: z.array(z.object({ id: optId, name: z.string().trim().min(1, 'Name each add-on').max(40), pricePaise: z.number().int().min(0).max(1000000), veg: z.boolean().default(true) })).min(1, 'An add-on group needs at least one choice').max(20),
})).max(6);

/** Validates sizes and add-on groups, keeps existing ids (recipes use them) and gives new rows an id. */
export function cleanOptions(variants: unknown, groups: unknown) {
  const pv = Variants.safeParse(variants ?? []), pg = Groups.safeParse(groups ?? []);
  if (!pv.success) throw new Error(pv.error.issues[0]?.message || 'Check the sizes');
  if (!pg.success) throw new Error(pg.error.issues[0]?.message || 'Check the add-ons');
  const v = pv.data.map(x => ({ ...x, id: x.id || randomCode(6) }));
  const g = pg.data.map(x => {
    const max = x.max && x.max < x.options.length ? x.max : x.options.length;
    if (x.min > max) throw new Error(`“${x.name}”: minimum is more than the choices available`);
    return { ...x, id: x.id || randomCode(6), max, options: x.options.map(o => ({ ...o, id: o.id || randomCode(6) })) };
  });
  const names = v.map(x => x.name.toLowerCase());
  if (new Set(names).size !== names.length) throw new Error('Two sizes have the same name');
  return { variants: v, addonGroups: g, minPrice: v.length ? Math.min(...v.map(x => x.pricePaise)) : null };
}

/** Short code for fast typing at the counter. Two dishes may never share one. */
export async function freeCode(venueId: string, raw: string, itemId?: string) {
  const code = raw.trim().toUpperCase();
  if (!code) return '';
  if (!/^[A-Z0-9]{1,6}$/.test(code)) throw bad('A short code is 1–6 letters or numbers, e.g. BC or 12.');
  const same = (await db().select({ id: schema.items.id, name: schema.items.name }).from(schema.items).where(and(eq(schema.items.venueId, venueId), eq(schema.items.shortCode, code)))).find(x => x.id !== itemId);
  if (same) throw bad(`Short code ${code} is already used by ${same.name}.`);
  return code;
}

// Stock engine. Every change is one row in stock_moves, so any number can be explained.
// - Sales take materials out by recipe (size, add-ons and cleaning loss included); cancelling puts them back.
// - Costs are a weighted average per unit, GST included (restaurants on 5% can't claim it back).
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { db, schema, type DB } from '@/db';
import type { StockMoveKind } from '@/db/schema';
import { emit } from './realtime';

export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
type Line = { itemId: string | null; variantId: string | null; qty: number; addons?: { id?: string }[] };
export const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** What to take out of stock for a usable quantity: 1 kg of peeled onion at 80% yield uses 1.25 kg. */
export const gross = (qty: number, yieldPct: number) => qty / (Math.max(1, yieldPct) / 100);

/** Materials used by order lines. A size's own recipe wins over the dish's general one; add-ons come on top. */
export async function usage(lines: Line[]) {
  const ids = [...new Set(lines.map(l => l.itemId).filter(Boolean))] as string[];
  const out = new Map<string, number>();
  if (!ids.length) return out;
  const rs = await db().select({ r: schema.recipes, y: schema.stockItems.yieldPct }).from(schema.recipes)
    .innerJoin(schema.stockItems, eq(schema.recipes.stockItemId, schema.stockItems.id)).where(inArray(schema.recipes.itemId, ids));
  const add = (r: (typeof rs)[number], qty: number) => out.set(r.r.stockItemId, (out.get(r.r.stockItemId) || 0) + gross(r.r.qty, r.y) * qty);
  for (const l of lines) {
    const mine = rs.filter(x => x.r.itemId === l.itemId);
    const dish = mine.filter(x => !x.r.addonId);
    const own = l.variantId ? dish.filter(x => x.r.variantId === l.variantId) : [];
    for (const r of own.length ? own : dish.filter(x => !x.r.variantId)) add(r, l.qty);
    for (const a of l.addons || []) if (a.id) for (const r of mine.filter(x => x.r.addonId === a.id)) add(r, l.qty);
  }
  return out;
}

export type Change = { stockItemId: string; qty: number; kind: StockMoveKind; totalPaise?: number; orderId?: string | null; refId?: string | null; supplier?: string; note?: string };

/**
 * Applies stock changes in one transaction. Stock coming in with a price (purchase, made, arrived) moves the weighted average cost.
 * Rows are locked in a fixed order, so two counters selling at the same moment never lose a change.
 */
export async function applyChanges(venueId: string, changes: Change[], by: string, outer?: Tx) {
  const list = changes.filter(c => Math.abs(c.qty) > 1e-9).sort((a, b) => a.stockItemId.localeCompare(b.stockItemId));
  if (!list.length) return [];
  const run = async (tx: Tx) => {
    const touched: string[] = [];
    for (const c of list) {
      const it = (await tx.select().from(schema.stockItems).where(and(eq(schema.stockItems.id, c.stockItemId), eq(schema.stockItems.venueId, venueId))).for('update'))[0];
      if (!it) continue;
      let avg = it.avgCost, last = it.costPaise;
      if (c.qty > 0 && c.totalPaise !== undefined) {
        const unit = c.totalPaise / c.qty;
        const had = Math.max(0, it.qty);   // a negative balance must not distort the average
        avg = (had * it.avgCost + c.totalPaise) / (had + c.qty);
        last = Math.round(unit);
      }
      await tx.insert(schema.stockMoves).values({
        venueId, stockItemId: it.id, kind: c.kind, qty: c.qty, costPaise: Math.round(c.totalPaise ?? 0), orderId: c.orderId ?? null, refId: c.refId ?? null,
        unitCost: c.qty > 0 && c.totalPaise !== undefined ? c.totalPaise / c.qty : it.avgCost, supplier: c.supplier ?? '', note: c.note ?? '', staffName: by,
      });
      await tx.update(schema.stockItems).set({ qty: sql`${schema.stockItems.qty} + ${c.qty}`, avgCost: avg, costPaise: last }).where(eq(schema.stockItems.id, it.id));
      touched.push(it.id);
    }
    return touched;
  };
  const touched = outer ? await run(outer) : await db().transaction(run);
  if (!outer) await syncSoldOut(venueId, touched);
  return touched;
}

/** Materials marked "switch dishes off when it runs out": dishes go off at zero and come back when stock arrives. */
export async function syncSoldOut(venueId: string, stockItemIds: string[]) {
  if (!stockItemIds.length) return;
  const mats = await db().select().from(schema.stockItems).where(and(inArray(schema.stockItems.id, stockItemIds), eq(schema.stockItems.autoOff, true)));
  if (!mats.length) return;
  // Only the dish itself decides; running out of an add-on's material must not hide the dish.
  const dishes = await db().selectDistinct({ id: schema.recipes.itemId }).from(schema.recipes).where(and(inArray(schema.recipes.stockItemId, mats.map(m => m.id)), sql`${schema.recipes.addonId} is null`));
  if (!dishes.length) return;
  const all = await db().select({ itemId: schema.recipes.itemId, qty: schema.stockItems.qty, autoOff: schema.stockItems.autoOff, active: schema.stockItems.active }).from(schema.recipes)
    .innerJoin(schema.stockItems, eq(schema.recipes.stockItemId, schema.stockItems.id))
    .where(and(inArray(schema.recipes.itemId, dishes.map(d => d.id)), sql`${schema.recipes.addonId} is null`));
  const out = new Set(all.filter(r => r.autoOff && r.active && r.qty <= 1e-9).map(r => r.itemId));
  const rows = await db().select().from(schema.items).where(inArray(schema.items.id, dishes.map(d => d.id)));
  let changed = false;
  for (const i of rows) {
    if (out.has(i.id) && i.isLive) { await db().update(schema.items).set({ isLive: false, stockOff: true }).where(eq(schema.items.id, i.id)); changed = true; }
    if (!out.has(i.id) && i.stockOff) { await db().update(schema.items).set({ isLive: true, stockOff: false }).where(eq(schema.items.id, i.id)); changed = true; }
  }
  if (changed) emit([`menu:${venueId}`, `venue:${venueId}`], 'menu', {});
}

/** Take the order's materials out of stock (once per order). */
export async function consumeStock(orderId: string) {
  const o = (await db().select({ venueId: schema.orders.venueId }).from(schema.orders).where(eq(schema.orders.id, orderId)))[0];
  if (!o) return;
  const done = await db().select({ n: sql<number>`count(*)::int` }).from(schema.stockMoves).where(and(eq(schema.stockMoves.orderId, orderId), eq(schema.stockMoves.kind, 'sale')));
  if (done[0].n) return;
  const lines = await db().select({ itemId: schema.orderItems.itemId, variantId: schema.orderItems.variantId, qty: schema.orderItems.qty, addons: schema.orderItems.addons })
    .from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
  const use = await usage(lines);
  await applyChanges(o.venueId, [...use].map(([stockItemId, q]) => ({ stockItemId, qty: -q, kind: 'sale' as const, orderId, note: 'sale' })), 'sale');
}

/** Put back whatever an order still holds (rejected / cancelled). Safe to call twice. */
export async function returnStock(orderId: string, by: string) {
  const rows = await db().select({ stockItemId: schema.stockMoves.stockItemId, venueId: schema.stockMoves.venueId, net: sql<number>`sum(${schema.stockMoves.qty})::float` })
    .from(schema.stockMoves).where(eq(schema.stockMoves.orderId, orderId)).groupBy(schema.stockMoves.stockItemId, schema.stockMoves.venueId);
  const open = rows.filter(r => r.net < -1e-9);
  if (open.length) await applyChanges(open[0].venueId, open.map(r => ({ stockItemId: r.stockItemId, qty: -r.net, kind: 'return' as const, orderId, note: 'order cancelled' })), by);
}

/** One line was reduced by `qty` (item cancelled after the KOT). */
export async function returnLineStock(venueId: string, orderId: string, line: Line, by: string) {
  const use = await usage([line]);
  await applyChanges(venueId, [...use].map(([stockItemId, q]) => ({ stockItemId, qty: q, kind: 'return' as const, orderId, note: 'item cancelled' })), by);
}

/** Materials at or below their low-stock level. */
export async function lowStock(venueId: string) {
  return db().select().from(schema.stockItems).where(and(eq(schema.stockItems.venueId, venueId), eq(schema.stockItems.active, true),
    or(sql`${schema.stockItems.qty} <= 0`, sql`${schema.stockItems.qty} <= ${schema.stockItems.lowLevel}`), sql`${schema.stockItems.lowLevel} > 0`));
}

// Inventory screens: raw materials, recipes, purchases, wastage, stock counts.
import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { bad, notFound } from './api';
import type { Staff } from './auth';
import { audit } from './audit';

export const UNITS = ['kg', 'g', 'l', 'ml', 'pcs', 'pack', 'dozen'] as const;

export async function inventoryOverview(venueId: string) {
  const since = new Date(Date.now() - 30 * 864e5);
  const [items, recipes, moves, used] = await Promise.all([
    db().select().from(schema.stockItems).where(eq(schema.stockItems.venueId, venueId)).orderBy(asc(schema.stockItems.name)),
    db().select().from(schema.recipes).where(eq(schema.recipes.venueId, venueId)),
    db().select().from(schema.stockMoves).where(and(eq(schema.stockMoves.venueId, venueId), sql`${schema.stockMoves.kind} <> 'sale' and ${schema.stockMoves.kind} <> 'return'`))
      .orderBy(desc(schema.stockMoves.at)).limit(60),
    // Net use by sales in the last 30 days, to show how many days the stock will last.
    db().select({ id: schema.stockMoves.stockItemId, qty: sql<number>`-sum(${schema.stockMoves.qty})::float` }).from(schema.stockMoves)
      .where(and(eq(schema.stockMoves.venueId, venueId), gte(schema.stockMoves.at, since), sql`${schema.stockMoves.kind} in ('sale','return')`))
      .groupBy(schema.stockMoves.stockItemId),
  ]);
  const firstMove = await db().select({ at: sql<string>`min(${schema.stockMoves.at})` }).from(schema.stockMoves).where(eq(schema.stockMoves.venueId, venueId));
  const days = Math.max(1, Math.min(30, (Date.now() - new Date(firstMove[0]?.at || Date.now()).getTime()) / 864e5));
  return {
    items: items.map(i => {
      const perDay = (used.find(u => u.id === i.id)?.qty ?? 0) / days;
      return { ...i, usedPerDay: Math.round(perDay * 1000) / 1000, daysLeft: perDay > 0 ? Math.floor(i.qty / perDay) : null, low: i.lowLevel > 0 && i.qty <= i.lowLevel };
    }),
    recipes, moves,
    valuePaise: Math.round(items.reduce((a, i) => a + Math.max(0, i.qty) * i.costPaise, 0)),
  };
}

export const StockItemInput = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(60), unit: z.enum(UNITS),
  lowLevel: z.number().min(0).max(1e6).default(0), costPaise: z.number().int().min(0).max(1e8).default(0),
  qty: z.number().min(-1e6).max(1e6).optional(), active: z.boolean().optional(),
});

export async function saveStockItem(venueId: string, s: Staff, id: string | null, raw: unknown) {
  const b = StockItemInput.parse(raw);
  if (id) {
    const cur = (await db().select().from(schema.stockItems).where(and(eq(schema.stockItems.id, id), eq(schema.stockItems.venueId, venueId))))[0];
    if (!cur) throw notFound('Material not found');
    const { qty: _q, ...rest } = b;
    void _q;
    const [row] = await db().update(schema.stockItems).set(rest).where(eq(schema.stockItems.id, id)).returning();
    await audit(s, { action: 'stock_item_changed', entity: 'stock_item', entityId: id, venueId, before: cur, after: row });
    return row;
  }
  const [row] = await db().insert(schema.stockItems).values({ venueId, name: b.name, unit: b.unit, lowLevel: b.lowLevel, costPaise: b.costPaise, qty: 0 }).returning();
  if (b.qty) await stockMove(venueId, s, { stockItemId: row.id, kind: 'adjust', qty: b.qty, note: 'Opening stock' });
  await audit(s, { action: 'stock_item_created', entity: 'stock_item', entityId: row.id, venueId, after: row });
  return row;
}

export const MoveInput = z.object({
  stockItemId: z.string().uuid(), kind: z.enum(['purchase', 'wastage', 'adjust', 'count']),
  qty: z.number().min(-1e6).max(1e6), costPaise: z.number().int().min(0).max(1e9).default(0),
  supplier: z.string().max(80).default(''), note: z.string().max(200).default(''),
});

/** Purchase (+qty), wastage (−qty), adjustment (±qty), or a physical count (sets the stock to qty). */
export async function stockMove(venueId: string, s: Staff, raw: unknown) {
  const b = MoveInput.parse(raw);
  const it = (await db().select().from(schema.stockItems).where(and(eq(schema.stockItems.id, b.stockItemId), eq(schema.stockItems.venueId, venueId))))[0];
  if (!it) throw notFound('Material not found');
  let qty = b.qty;
  if (b.kind === 'purchase' || b.kind === 'wastage') { if (qty <= 0) throw bad('Enter a quantity.'); if (b.kind === 'wastage') qty = -qty; }
  if (b.kind === 'count') { if (qty < 0) throw bad('A count cannot be negative.'); qty = b.qty - it.qty; }
  if (!qty) return it;
  const kind = b.kind === 'count' ? 'adjust' : b.kind;
  if (kind === 'wastage' && !b.note.trim()) throw bad('Say why it was wasted (it shows in the stock report).');
  await db().transaction(async tx => {
    await tx.insert(schema.stockMoves).values({ venueId, stockItemId: it.id, kind, qty, costPaise: b.kind === 'purchase' ? b.costPaise : 0,
      supplier: b.supplier.trim(), note: b.kind === 'count' ? (b.note.trim() || `Counted ${b.qty} ${it.unit}`) : b.note.trim(), staffName: s.name });
    await tx.update(schema.stockItems).set({
      qty: sql`${schema.stockItems.qty} + ${qty}`,
      ...(b.kind === 'purchase' && b.costPaise ? { costPaise: Math.round(b.costPaise / b.qty) } : {}),
    }).where(eq(schema.stockItems.id, it.id));
  });
  await audit(s, { action: `stock_${b.kind}`, entity: 'stock_item', entityId: it.id, venueId, after: { name: it.name, qty, unit: it.unit, costPaise: b.costPaise, note: b.note } });
  return (await db().select().from(schema.stockItems).where(eq(schema.stockItems.id, it.id)))[0];
}

export const RecipeInput = z.object({
  itemId: z.string().uuid(), variantId: z.string().max(40).nullable().default(null),
  lines: z.array(z.object({ stockItemId: z.string().uuid(), qty: z.number().positive().max(1e5) })).max(30),
});

/** Replace the recipe of one item (or one size of it). */
export async function saveRecipe(venueId: string, s: Staff, raw: unknown) {
  const b = RecipeInput.parse(raw);
  const item = (await db().select().from(schema.items).where(and(eq(schema.items.id, b.itemId), eq(schema.items.venueId, venueId))))[0];
  if (!item) throw notFound('Menu item not found');
  const mats = await db().select({ id: schema.stockItems.id }).from(schema.stockItems).where(eq(schema.stockItems.venueId, venueId));
  if (b.lines.some(l => !mats.some(m => m.id === l.stockItemId))) throw bad('Choose a material from this venue.');
  await db().transaction(async tx => {
    await tx.delete(schema.recipes).where(and(eq(schema.recipes.itemId, item.id),
      b.variantId ? eq(schema.recipes.variantId, b.variantId) : sql`${schema.recipes.variantId} is null`));
    if (b.lines.length) await tx.insert(schema.recipes).values(b.lines.map(l => ({ venueId, itemId: item.id, variantId: b.variantId, stockItemId: l.stockItemId, qty: l.qty })));
  });
  await audit(s, { action: 'recipe_saved', entity: 'item', entityId: item.id, venueId, after: { item: item.name, variantId: b.variantId, lines: b.lines } });
}

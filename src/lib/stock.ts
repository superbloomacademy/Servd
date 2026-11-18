// Inventory: raw materials go down automatically when an order is placed (by the item's recipe)
// and come back if the order is rejected/cancelled or an item is cancelled.
// Every change is one row in stock_moves, so the stock report can explain each number.
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/db';

type Line = { itemId: string | null; variantId: string | null; qty: number };

/** Recipe lines for order lines: a size's own recipe wins; otherwise the item's general recipe. */
async function usage(lines: Line[]) {
  const ids = [...new Set(lines.map(l => l.itemId).filter(Boolean))] as string[];
  if (!ids.length) return new Map<string, number>();
  const rs = await db().select().from(schema.recipes).where(inArray(schema.recipes.itemId, ids));
  const out = new Map<string, number>();
  for (const l of lines) {
    const mine = rs.filter(r => r.itemId === l.itemId);
    const own = l.variantId ? mine.filter(r => r.variantId === l.variantId) : [];
    for (const r of own.length ? own : mine.filter(r => !r.variantId)) out.set(r.stockItemId, (out.get(r.stockItemId) || 0) + r.qty * l.qty);
  }
  return out;
}

async function move(venueId: string, use: Map<string, number>, kind: 'sale' | 'return', sign: 1 | -1, orderId: string | null, by: string, note = '') {
  if (!use.size) return;
  await db().transaction(async tx => {
    for (const [stockItemId, q] of use) {
      const qty = sign * q;
      if (!qty) continue;
      await tx.insert(schema.stockMoves).values({ venueId, stockItemId, kind, qty, orderId, staffName: by, note });
      await tx.update(schema.stockItems).set({ qty: sql`${schema.stockItems.qty} + ${qty}` }).where(eq(schema.stockItems.id, stockItemId));
    }
  });
}

/** Take the order's materials out of stock (once per order). */
export async function consumeStock(orderId: string) {
  const o = (await db().select({ venueId: schema.orders.venueId }).from(schema.orders).where(eq(schema.orders.id, orderId)))[0];
  if (!o) return;
  const done = await db().select({ n: sql<number>`count(*)::int` }).from(schema.stockMoves).where(and(eq(schema.stockMoves.orderId, orderId), eq(schema.stockMoves.kind, 'sale')));
  if (done[0].n) return;
  const lines = await db().select({ itemId: schema.orderItems.itemId, variantId: schema.orderItems.variantId, qty: schema.orderItems.qty })
    .from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
  await move(o.venueId, await usage(lines), 'sale', -1, orderId, 'sale');
}

/** Put back whatever an order still holds (rejected / cancelled). Safe to call twice. */
export async function returnStock(orderId: string, by: string) {
  const rows = await db().select({ stockItemId: schema.stockMoves.stockItemId, venueId: schema.stockMoves.venueId, net: sql<number>`sum(${schema.stockMoves.qty})::float` })
    .from(schema.stockMoves).where(eq(schema.stockMoves.orderId, orderId)).groupBy(schema.stockMoves.stockItemId, schema.stockMoves.venueId);
  const open = rows.filter(r => r.net < -1e-9);
  if (!open.length) return;
  await move(open[0].venueId, new Map(open.map(r => [r.stockItemId, -r.net])), 'return', 1, orderId, by, 'order cancelled');
}

/** One line was reduced by `qty` (item cancelled after the KOT). */
export async function returnLineStock(venueId: string, orderId: string, line: Line, by: string) {
  await move(venueId, await usage([line]), 'return', 1, orderId, by, 'item cancelled');
}

/** Materials at or below their low-stock level. */
export async function lowStock(venueId: string) {
  return db().select().from(schema.stockItems).where(and(eq(schema.stockItems.venueId, venueId), eq(schema.stockItems.active, true),
    sql`${schema.stockItems.qty} <= ${schema.stockItems.lowLevel}`, sql`${schema.stockItems.lowLevel} > 0`));
}

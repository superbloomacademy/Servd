// Inventory: materials, suppliers, purchases → deliveries → payments, recipes, kitchen batches, counts, transfers, reports.
import { and, asc, desc, eq, gte, inArray, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { isSale } from './admin';
import { bad, forbidden, notFound } from './api';
import { staffCanAccessVenue, type Staff } from './auth';
import { audit } from './audit';
import { addCashEntry } from './cash';
import { dayRange } from './reports';
import { applyChanges, gross, round3, syncSoldOut, type Change } from './stock';
import { localParts } from './util';

export const UNITS = ['kg', 'g', 'l', 'ml', 'pcs', 'pack', 'dozen'] as const;
const uuid = z.string().uuid();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date');
const num = (max = 1e6) => z.number().finite().min(0).max(max);

async function material(venueId: string, id: string) {
  const it = /^[0-9a-f-]{36}$/.test(id) ? (await db().select().from(schema.stockItems).where(and(eq(schema.stockItems.id, id), eq(schema.stockItems.venueId, venueId))))[0] : null;
  if (!it) throw notFound('Material not found');
  return it;
}
const materials = (venueId: string) => db().select().from(schema.stockItems).where(eq(schema.stockItems.venueId, venueId)).orderBy(asc(schema.stockItems.name));

// ---------------------------------------------------------------- overview
export async function inventoryOverview(venueId: string) {
  const since = new Date(Date.now() - 30 * 864e5);
  const [items, recipes, prepLines, moves, used, suppliers, batches, purchases, first] = await Promise.all([
    materials(venueId),
    db().select().from(schema.recipes).where(eq(schema.recipes.venueId, venueId)),
    db().select().from(schema.prepLines).where(eq(schema.prepLines.venueId, venueId)),
    db().select().from(schema.stockMoves).where(and(eq(schema.stockMoves.venueId, venueId), sql`${schema.stockMoves.kind} not in ('sale','return')`)).orderBy(desc(schema.stockMoves.at)).limit(80),
    db().select({ id: schema.stockMoves.stockItemId, qty: sql<number>`-sum(${schema.stockMoves.qty})::float` }).from(schema.stockMoves)
      .where(and(eq(schema.stockMoves.venueId, venueId), gte(schema.stockMoves.at, since), sql`${schema.stockMoves.kind} in ('sale','return','used')`)).groupBy(schema.stockMoves.stockItemId),
    supplierList(venueId),
    db().select().from(schema.stockBatches).where(eq(schema.stockBatches.venueId, venueId)).orderBy(desc(schema.stockBatches.at)).limit(2000),
    purchaseList(venueId),
    db().select({ at: sql<string | null>`min(${schema.stockMoves.at})` }).from(schema.stockMoves).where(eq(schema.stockMoves.venueId, venueId)),
  ]);
  const days = Math.max(1, Math.min(30, (Date.now() - new Date(first[0]?.at || Date.now()).getTime()) / 864e5));
  const today = localParts().date;
  // Already ordered and still to come, so a low item isn't ordered twice.
  const coming = new Map<string, number>();
  for (const p of purchases) if (p.status === 'ordered' || p.status === 'part') for (const l of p.lines) coming.set(l.stockItemId, (coming.get(l.stockItemId) || 0) + Math.max(0, l.qty - l.received) * l.factor);
  // Oldest stock is used first, so what is left belongs to the newest deliveries.
  const expiring: { stockItemId: string; name: string; unit: string; qty: number; expiry: string; daysLeft: number }[] = [];
  for (const i of items.filter(x => x.active)) {
    let left = Math.max(0, i.qty);
    for (const b of batches.filter(x => x.stockItemId === i.id)) {
      if (left <= 1e-9) break;
      const qty = Math.min(left, b.qty); left -= qty;
      const daysLeft = Math.round((Date.parse(b.expiry) - Date.parse(today)) / 864e5);
      if (daysLeft <= 3) expiring.push({ stockItemId: i.id, name: i.name, unit: i.unit, qty: round3(qty), expiry: b.expiry, daysLeft });
    }
  }
  return {
    items: items.map(i => {
      const perDay = (used.find(u => u.id === i.id)?.qty ?? 0) / days;
      const low = i.active && i.lowLevel > 0 && i.qty <= i.lowLevel;
      const order = round3(Math.max(0, (i.reorderQty || Math.max(i.lowLevel * 2 - i.qty, perDay * 7)) - (coming.get(i.id) || 0)));
      return { ...i, qty: round3(i.qty), usedPerDay: round3(perDay), daysLeft: perDay > 0 ? Math.max(0, Math.floor(i.qty / perDay)) : null, low, out: i.active && i.qty <= 1e-9 && (i.lowLevel > 0 || perDay > 0),
        coming: round3(coming.get(i.id) || 0), suggest: low && i.kind === 'raw' ? order : 0 };
    }),
    recipes, prepLines, moves, suppliers, purchases, expiring: expiring.sort((a, b) => a.daysLeft - b.daysLeft),
    valuePaise: Math.round(items.reduce((a, i) => a + Math.max(0, i.qty) * i.avgCost, 0)),
    owedPaise: suppliers.reduce((a, s) => a + Math.max(0, s.duePaise), 0),
  };
}

// ---------------------------------------------------------------- materials
export const StockItemInput = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(60), unit: z.enum(UNITS), kind: z.enum(['raw', 'prep']).default('raw'), category: z.string().trim().max(40).default(''),
  lowLevel: num().default(0), reorderQty: num().default(0), costPaise: z.number().int().min(0).max(1e8).default(0), qty: num().optional(), active: z.boolean().optional(),
  buyUnit: z.string().trim().max(20).default(''), buyFactor: z.number().positive('1 buying unit must hold something').max(1e5).default(1),
  yieldPct: z.number().min(1, 'Usable part must be 1–100%').max(100, 'Usable part must be 1–100%').default(100), batchQty: num().default(0),
  shelfDays: z.number().int().min(0).max(3650).default(0), supplierId: uuid.nullish(), autoOff: z.boolean().default(false),
});
export async function saveStockItem(venueId: string, s: Staff, id: string | null, raw: unknown) {
  const cur = id ? await material(venueId, id) : null;
  const b = StockItemInput.parse(cur ? { ...cur, qty: undefined, ...(raw as object) } : raw);
  const all = await materials(venueId);
  if (all.some(x => x.id !== id && x.name.trim().toLowerCase() === b.name.toLowerCase())) throw bad(`“${b.name}” is already in your materials.`);
  if (b.supplierId && !(await db().select({ id: schema.suppliers.id }).from(schema.suppliers).where(and(eq(schema.suppliers.id, b.supplierId), eq(schema.suppliers.venueId, venueId))))[0]) throw bad('Choose one of your suppliers.');
  if (cur && b.unit !== cur.unit) {
    const used = await db().select({ n: sql<number>`count(*)::int` }).from(schema.stockMoves).where(eq(schema.stockMoves.stockItemId, cur.id));
    if (used[0].n) throw bad(`The unit can’t change after ${cur.name} has stock history. Add it as a new material instead.`);
  }
  const { qty, ...f } = b;
  const set = { ...f, supplierId: b.supplierId ?? null, buyFactor: b.buyUnit ? b.buyFactor : 1 };
  if (cur) {
    const [row] = await db().update(schema.stockItems).set({ ...set, costPaise: cur.costPaise }).where(eq(schema.stockItems.id, cur.id)).returning();
    await audit(s, { action: 'stock_item_changed', entity: 'stock_item', entityId: cur.id, venueId, before: cur, after: row });
    await syncSoldOut(venueId, [cur.id]);
    return row;
  }
  const [row] = await db().insert(schema.stockItems).values({ ...set, venueId, qty: 0, avgCost: b.costPaise }).returning();
  if (qty) await applyChanges(venueId, [{ stockItemId: row.id, qty, kind: 'adjust', totalPaise: Math.round(qty * b.costPaise), note: 'Opening stock' }], s.name);
  await audit(s, { action: 'stock_item_created', entity: 'stock_item', entityId: row.id, venueId, after: row });
  return material(venueId, row.id);
}

/** Wastage (reason required) or a single correction. */
export const MoveInput = z.object({ stockItemId: uuid, kind: z.enum(['wastage', 'count']), qty: num(), note: z.string().trim().max(200).default('') });
export async function stockMove(venueId: string, s: Staff, raw: unknown) {
  const b = MoveInput.parse(raw);
  const it = await material(venueId, b.stockItemId);
  if (b.kind === 'wastage') {
    if (b.qty <= 0) throw bad('Enter a quantity.');
    if (b.qty > it.qty + 1e-9) throw bad(`Only ${round3(it.qty)} ${it.unit} of ${it.name} is in stock.`);
    if (!b.note) throw bad('Say why it was wasted (it shows in the stock report).');
  }
  const qty = b.kind === 'wastage' ? -b.qty : b.qty - it.qty;
  await applyChanges(venueId, [{ stockItemId: it.id, qty, kind: b.kind, note: b.note || `Counted ${b.qty} ${it.unit}` }], s.name);
  await audit(s, { action: `stock_${b.kind}`, entity: 'stock_item', entityId: it.id, venueId, after: { name: it.name, qty, unit: it.unit, valuePaise: Math.round(qty * it.avgCost), note: b.note } });
  return material(venueId, it.id);
}

// ---------------------------------------------------------------- suppliers
export async function supplierList(venueId: string) {
  const [list, bills, paid] = await Promise.all([
    db().select().from(schema.suppliers).where(eq(schema.suppliers.venueId, venueId)).orderBy(asc(schema.suppliers.name)),
    db().select({ id: schema.receipts.supplierId, total: sql<number>`sum(${schema.receipts.totalPaise})::bigint`, last: sql<string>`max(${schema.receipts.billDate})` }).from(schema.receipts).where(eq(schema.receipts.venueId, venueId)).groupBy(schema.receipts.supplierId),
    db().select({ id: schema.supplierPayments.supplierId, total: sql<number>`sum(${schema.supplierPayments.amountPaise})::bigint` }).from(schema.supplierPayments).where(eq(schema.supplierPayments.venueId, venueId)).groupBy(schema.supplierPayments.supplierId),
  ]);
  return list.map(x => { const b = Number(bills.find(y => y.id === x.id)?.total ?? 0), p = Number(paid.find(y => y.id === x.id)?.total ?? 0); return { ...x, billedPaise: b, paidPaise: p, duePaise: b - p, lastBill: bills.find(y => y.id === x.id)?.last ?? null }; });
}
async function supplier(venueId: string, id: string) {
  const x = (await db().select().from(schema.suppliers).where(and(eq(schema.suppliers.id, id), eq(schema.suppliers.venueId, venueId))))[0];
  if (!x) throw notFound('Supplier not found');
  return x;
}
const SupplierInput = z.object({ name: z.string().trim().min(2, 'Name is too short').max(60), phone: z.string().trim().max(15).default(''), gstin: z.string().trim().toUpperCase().max(15).default(''), notes: z.string().trim().max(300).default(''), active: z.boolean().default(true) });
export async function saveSupplier(venueId: string, s: Staff, id: string | null, raw: unknown) {
  const b = SupplierInput.parse(raw);
  if (id) await supplier(venueId, id);
  const [row] = id ? await db().update(schema.suppliers).set(b).where(eq(schema.suppliers.id, id)).returning() : await db().insert(schema.suppliers).values({ ...b, venueId }).returning();
  await audit(s, { action: id ? 'supplier_changed' : 'supplier_added', entity: 'supplier', entityId: row.id, venueId, after: b });
  return row;
}
export async function supplierLedger(venueId: string, id: string) {
  const x = await supplier(venueId, id);
  const [bills, pays] = await Promise.all([
    db().select().from(schema.receipts).where(and(eq(schema.receipts.venueId, venueId), eq(schema.receipts.supplierId, id))).orderBy(desc(schema.receipts.at)).limit(200),
    db().select().from(schema.supplierPayments).where(and(eq(schema.supplierPayments.venueId, venueId), eq(schema.supplierPayments.supplierId, id))).orderBy(desc(schema.supplierPayments.at)).limit(200),
  ]);
  return { supplier: x, bills, payments: pays };
}
const PayInput = z.object({ supplierId: uuid, amountPaise: z.number().int().positive('Enter an amount').max(1e9), method: z.enum(['cash', 'upi', 'bank', 'card']), fromDrawer: z.boolean().default(false), note: z.string().trim().max(120).default('') });
export async function paySupplier(venueId: string, s: Staff, raw: unknown) {
  const b = PayInput.parse(raw);
  const x = (await supplierList(venueId)).find(y => y.id === b.supplierId);
  if (!x) throw notFound('Supplier not found');
  if (b.amountPaise > x.duePaise) throw bad(`Only ₹${(x.duePaise / 100).toFixed(2)} is due to ${x.name}.`);
  if (b.fromDrawer && b.method !== 'cash') throw bad('Only cash comes from the drawer.');
  const [row] = await db().insert(schema.supplierPayments).values({ ...b, venueId, by: s.name }).returning();
  if (b.fromDrawer) await addCashEntry(venueId, s, { kind: 'expense', amountPaise: b.amountPaise, category: 'Supplier', note: `Paid ${x.name}${b.note ? ` · ${b.note}` : ''}` });
  await audit(s, { action: 'supplier_paid', entity: 'supplier', entityId: x.id, venueId, after: { name: x.name, amountPaise: b.amountPaise, method: b.method } });
  return row;
}

// ---------------------------------------------------------------- purchases
export async function purchaseList(venueId: string, limit = 60) {
  const ps = await db().select().from(schema.purchases).where(eq(schema.purchases.venueId, venueId)).orderBy(desc(schema.purchases.number)).limit(limit);
  if (!ps.length) return [];
  const ids = ps.map(p => p.id);
  const [lines, recs] = await Promise.all([
    db().select({ l: schema.purchaseLines, name: schema.stockItems.name, stockUnit: schema.stockItems.unit }).from(schema.purchaseLines).innerJoin(schema.stockItems, eq(schema.purchaseLines.stockItemId, schema.stockItems.id)).where(inArray(schema.purchaseLines.purchaseId, ids)),
    db().select().from(schema.receipts).where(inArray(schema.receipts.purchaseId, ids)).orderBy(asc(schema.receipts.at)),
  ]);
  return ps.map(p => {
    const ls = lines.filter(x => x.l.purchaseId === p.id).map(x => ({ ...x.l, name: x.name, stockUnit: x.stockUnit }));
    return { ...p, lines: ls, receipts: recs.filter(r => r.purchaseId === p.id), totalPaise: Math.round(ls.reduce((a, l) => a + l.qty * l.ratePaise * (1 + l.taxBps / 10000), 0)) };
  });
}
const Delivered = z.object({ billNo: z.string().trim().max(40).default(''), billDate: ymd.optional(), allowDuplicate: z.boolean().default(false) });
const PurchaseInput = z.object({
  supplierId: uuid.nullish(), expectedOn: ymd.nullish(), note: z.string().trim().max(200).default(''),
  lines: z.array(z.object({ stockItemId: uuid, inBuyUnit: z.boolean().default(false), qty: z.number().finite().positive('Enter a quantity').max(1e6), ratePaise: num(1e8).default(0), taxBps: z.number().int().min(0).max(2800).default(0), expiry: ymd.nullish() })).min(1, 'Add at least one material.').max(100),
  /** Set when the goods are already here: the bill is entered and stocked in one step. */
  received: Delivered.optional(),
});
export async function createPurchase(venueId: string, s: Staff, raw: unknown) {
  const b = PurchaseInput.parse(raw);
  if (b.supplierId) await supplier(venueId, b.supplierId);
  if (new Set(b.lines.map(l => l.stockItemId)).size !== b.lines.length) throw bad('The same material is on this list twice. Put it on one line.');
  const mats = await materials(venueId);
  const lines = b.lines.map(l => {
    const m = mats.find(x => x.id === l.stockItemId);
    if (!m) throw bad('Choose a material from this venue.');
    if (m.kind === 'prep') throw bad(`${m.name} is made in your kitchen, so it can’t be bought.`);
    const buy = l.inBuyUnit && !!m.buyUnit;
    return { stockItemId: m.id, unit: buy ? m.buyUnit : m.unit, factor: buy ? m.buyFactor : 1, qty: l.qty, ratePaise: l.ratePaise, taxBps: l.taxBps };
  });
  if (b.received) await checkBill(venueId, b.supplierId ?? null, b.received);
  const p = await db().transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'po' + venueId}))`);   // numbers run 1, 2, 3 per venue
    const [{ n }] = await tx.select({ n: sql<number>`coalesce(max(${schema.purchases.number}), 0)::int + 1` }).from(schema.purchases).where(eq(schema.purchases.venueId, venueId));
    const [row] = await tx.insert(schema.purchases).values({ venueId, supplierId: b.supplierId ?? null, number: n, expectedOn: b.expectedOn ?? null, note: b.note, createdBy: s.name }).returning();
    await tx.insert(schema.purchaseLines).values(lines.map(l => ({ ...l, purchaseId: row.id })));
    return row;
  });
  await audit(s, { action: 'purchase_created', entity: 'purchase', entityId: p.id, venueId, after: { number: p.number, lines: lines.length } });
  if (b.received) {
    const ls = await db().select().from(schema.purchaseLines).where(eq(schema.purchaseLines.purchaseId, p.id));
    await receivePurchase(venueId, s, { purchaseId: p.id, ...b.received, lines: ls.map(l => ({ lineId: l.id, qty: l.qty, ratePaise: l.ratePaise, taxBps: l.taxBps, expiry: b.lines.find(x => x.stockItemId === l.stockItemId)?.expiry ?? null })) });
  }
  return (await purchaseList(venueId)).find(x => x.id === p.id)!;
}
async function checkBill(venueId: string, supplierId: string | null, d: z.infer<typeof Delivered>) {
  if (!d.billNo || !supplierId || d.allowDuplicate) return;
  const same = await db().select().from(schema.receipts).where(and(eq(schema.receipts.venueId, venueId), eq(schema.receipts.supplierId, supplierId), sql`lower(${schema.receipts.billNo}) = ${d.billNo.toLowerCase()}`));
  if (same.length) throw bad(`Bill ${d.billNo} from this supplier was already entered on ${same[0].billDate}. Check it isn’t the same bill.`, 'DUPLICATE_BILL');
}
const ReceiveInput = Delivered.extend({
  purchaseId: uuid,
  lines: z.array(z.object({ lineId: uuid, qty: num(), ratePaise: num(1e8), taxBps: z.number().int().min(0).max(2800).default(0), expiry: ymd.nullish() })).min(1),
});
/** Goods arrived (all or some): stock goes up at the real rate, the supplier’s balance goes up by the bill. */
export async function receivePurchase(venueId: string, s: Staff, raw: unknown) {
  const b = ReceiveInput.parse(raw);
  const p = (await db().select().from(schema.purchases).where(and(eq(schema.purchases.id, b.purchaseId), eq(schema.purchases.venueId, venueId))))[0];
  if (!p) throw notFound('Purchase not found');
  if (p.status === 'cancelled' || p.status === 'received') throw bad(`This purchase is already ${p.status}.`);
  await checkBill(venueId, p.supplierId, b);
  const mats = await materials(venueId);
  const sup = p.supplierId ? await supplier(venueId, p.supplierId) : null;
  const touched = await db().transaction(async tx => {
    const ls = await tx.select().from(schema.purchaseLines).where(eq(schema.purchaseLines.purchaseId, p.id)).for('update');
    const got = b.lines.filter(l => l.qty > 0).map(l => { const line = ls.find(x => x.id === l.lineId); if (!line) throw bad('This line is not part of the purchase.'); return { ...l, line, m: mats.find(m => m.id === line.stockItemId)! }; });
    if (!got.length) throw bad('Enter how much arrived.');
    const net = (g: (typeof got)[number]) => g.qty * g.ratePaise, tax = (g: (typeof got)[number]) => net(g) * g.taxBps / 10000;
    const subtotal = Math.round(got.reduce((a, g) => a + net(g), 0)), taxTotal = Math.round(got.reduce((a, g) => a + tax(g), 0));
    const billDate = b.billDate || localParts().date;
    const exp = (g: (typeof got)[number]) => g.expiry ?? (g.m.shelfDays > 0 ? new Date(Date.parse(billDate) + g.m.shelfDays * 864e5).toISOString().slice(0, 10) : null);
    const [rec] = await tx.insert(schema.receipts).values({
      venueId, purchaseId: p.id, supplierId: p.supplierId, billNo: b.billNo, billDate, subtotalPaise: subtotal, taxPaise: taxTotal, totalPaise: subtotal + taxTotal, by: s.name,
      lines: got.map(g => ({ stockItemId: g.m.id, name: g.m.name, qty: g.qty, unit: g.line.unit, ratePaise: g.ratePaise, taxBps: g.taxBps, expiry: exp(g) })),
    }).returning();
    for (const g of got) {
      await tx.update(schema.purchaseLines).set({ received: sql`${schema.purchaseLines.received} + ${g.qty}`, ratePaise: g.ratePaise, taxBps: g.taxBps }).where(eq(schema.purchaseLines.id, g.line.id));
      const e = exp(g);
      if (e) await tx.insert(schema.stockBatches).values({ venueId, stockItemId: g.m.id, qty: g.qty * g.line.factor, expiry: e });
    }
    const ids = await applyChanges(venueId, got.map(g => ({ stockItemId: g.m.id, qty: g.qty * g.line.factor, kind: 'purchase' as const, totalPaise: net(g) + tax(g), refId: rec.id, supplier: sup?.name ?? '', note: b.billNo ? `Bill ${b.billNo}` : `Purchase ${p.number}` })), s.name, tx);
    const after = await tx.select().from(schema.purchaseLines).where(eq(schema.purchaseLines.purchaseId, p.id));
    await tx.update(schema.purchases).set({ status: after.every(l => l.received >= l.qty - 1e-9) ? 'received' : 'part' }).where(eq(schema.purchases.id, p.id));
    return ids;
  });
  await syncSoldOut(venueId, touched);
  await audit(s, { action: 'goods_received', entity: 'purchase', entityId: p.id, venueId, after: { number: p.number, billNo: b.billNo, supplier: sup?.name } });
  return (await purchaseList(venueId)).find(x => x.id === p.id)!;
}
/** Cancel an order nothing arrived for, or close one where the rest isn’t coming. */
export async function closePurchase(venueId: string, s: Staff, id: string) {
  const p = (await db().select().from(schema.purchases).where(and(eq(schema.purchases.id, id), eq(schema.purchases.venueId, venueId))))[0];
  if (!p) throw notFound('Purchase not found');
  if (p.status === 'received' || p.status === 'cancelled') throw bad('This purchase is already closed.');
  const status = p.status === 'part' ? 'received' as const : 'cancelled' as const;
  await db().update(schema.purchases).set({ status }).where(eq(schema.purchases.id, id));
  await audit(s, { action: status === 'cancelled' ? 'purchase_cancelled' : 'purchase_closed_short', entity: 'purchase', entityId: id, venueId, after: { number: p.number } });
}

// ---------------------------------------------------------------- recipes
const RecipeLines = z.array(z.object({ stockItemId: uuid, qty: z.number().finite().positive('Every ingredient needs a quantity').max(1e5) })).max(40);
export const RecipeInput = z.object({ itemId: uuid, variantId: z.string().max(40).nullable().default(null), addonId: z.string().max(40).nullable().default(null), lines: RecipeLines });
async function checkMaterials(venueId: string, lines: z.infer<typeof RecipeLines>) {
  const mats = await materials(venueId);
  if (lines.some(l => !mats.some(m => m.id === l.stockItemId))) throw bad('Choose a material from this venue.');
  if (new Set(lines.map(l => l.stockItemId)).size !== lines.length) throw bad('The same ingredient is listed twice.');
  return mats;
}
/** Replace the recipe of a dish, of one of its sizes, or of one add-on. */
export async function saveRecipe(venueId: string, s: Staff, raw: unknown) {
  const b = RecipeInput.parse(raw);
  const item = (await db().select().from(schema.items).where(and(eq(schema.items.id, b.itemId), eq(schema.items.venueId, venueId))))[0];
  if (!item) throw notFound('Menu item not found');
  if (b.variantId && !item.variants.some(v => v.id === b.variantId)) throw bad('That size is no longer on the menu.');
  if (b.addonId && !item.addonGroups.some(g => g.options.some(o => o.id === b.addonId))) throw bad('That add-on is no longer on the menu.');
  await checkMaterials(venueId, b.lines);
  await db().transaction(async tx => {
    await tx.delete(schema.recipes).where(and(eq(schema.recipes.itemId, item.id),
      b.variantId ? eq(schema.recipes.variantId, b.variantId) : sql`${schema.recipes.variantId} is null`, b.addonId ? eq(schema.recipes.addonId, b.addonId) : sql`${schema.recipes.addonId} is null`));
    if (b.lines.length) await tx.insert(schema.recipes).values(b.lines.map(l => ({ venueId, itemId: item.id, variantId: b.variantId, addonId: b.addonId, stockItemId: l.stockItemId, qty: l.qty })));
  });
  await audit(s, { action: 'recipe_saved', entity: 'item', entityId: item.id, venueId, after: { item: item.name, variantId: b.variantId, addonId: b.addonId, lines: b.lines } });
}
/** Ingredients of a prepared item (one batch). Preparations may use other preparations, but never themselves. */
export async function savePrep(venueId: string, s: Staff, raw: unknown) {
  const b = z.object({ prepId: uuid, batchQty: z.number().positive('How much does one batch make?').max(1e5), lines: RecipeLines }).parse(raw);
  const prep = await material(venueId, b.prepId);
  if (prep.kind !== 'prep') throw bad(`${prep.name} is bought, not made in the kitchen.`);
  await checkMaterials(venueId, b.lines);
  const all = await db().select().from(schema.prepLines).where(eq(schema.prepLines.venueId, venueId));
  const reaches = (from: string, seen = new Set<string>()): boolean => from === prep.id || (!seen.has(from) && (seen.add(from), all.filter(l => l.prepId === from).some(l => reaches(l.stockItemId, seen))));
  if (b.lines.some(l => reaches(l.stockItemId))) throw bad(`${prep.name} can’t be made from itself.`);
  await db().transaction(async tx => {
    await tx.delete(schema.prepLines).where(eq(schema.prepLines.prepId, prep.id));
    if (b.lines.length) await tx.insert(schema.prepLines).values(b.lines.map(l => ({ ...l, venueId, prepId: prep.id })));
    await tx.update(schema.stockItems).set({ batchQty: b.batchQty }).where(eq(schema.stockItems.id, prep.id));
  });
  await audit(s, { action: 'prep_recipe_saved', entity: 'stock_item', entityId: prep.id, venueId, after: { name: prep.name, batchQty: b.batchQty, lines: b.lines } });
}
/** The kitchen made some of a prepared item: its ingredients go down, it goes up at their cost. */
export async function produce(venueId: string, s: Staff, raw: unknown) {
  const b = z.object({ prepId: uuid, qty: z.number().finite().positive('Enter how much you made').max(1e5) }).parse(raw);
  const prep = await material(venueId, b.prepId);
  const lines = await db().select().from(schema.prepLines).where(eq(schema.prepLines.prepId, prep.id));
  if (prep.kind !== 'prep' || !lines.length || prep.batchQty <= 0) throw bad(`Add the recipe of ${prep.name} first.`);
  const mats = await materials(venueId);
  const use = lines.map(l => { const m = mats.find(x => x.id === l.stockItemId)!; return { m, qty: gross(l.qty, m.yieldPct) * b.qty / prep.batchQty }; });
  const cost = use.reduce((a, u) => a + u.qty * u.m.avgCost, 0);
  const changes: Change[] = [...use.map(u => ({ stockItemId: u.m.id, qty: -u.qty, kind: 'used' as const, refId: prep.id, note: `For ${prep.name}` })),
    { stockItemId: prep.id, qty: b.qty, kind: 'made', totalPaise: cost, refId: prep.id, note: `Made ${b.qty} ${prep.unit}` }];
  await applyChanges(venueId, changes, s.name);
  if (prep.shelfDays > 0) await db().insert(schema.stockBatches).values({ venueId, stockItemId: prep.id, qty: b.qty, expiry: new Date(Date.parse(localParts().date) + prep.shelfDays * 864e5).toISOString().slice(0, 10) });
  await audit(s, { action: 'batch_made', entity: 'stock_item', entityId: prep.id, venueId, after: { name: prep.name, qty: b.qty, unit: prep.unit, costPaise: Math.round(cost) } });
  return material(venueId, prep.id);
}

// ---------------------------------------------------------------- full physical count
export async function finishCount(venueId: string, s: Staff, raw: unknown) {
  const b = z.object({ note: z.string().trim().max(200).default(''), lines: z.array(z.object({ stockItemId: uuid, counted: num() })).min(1, 'Count at least one material.').max(1000) }).parse(raw);
  if (new Set(b.lines.map(l => l.stockItemId)).size !== b.lines.length) throw bad('A material was counted twice.');
  const { row, touched } = await db().transaction(async tx => {
    const ids = b.lines.map(l => l.stockItemId).sort();
    const mats = await tx.select().from(schema.stockItems).where(and(eq(schema.stockItems.venueId, venueId), inArray(schema.stockItems.id, ids))).orderBy(asc(schema.stockItems.id)).for('update');
    if (mats.length !== ids.length) throw notFound('Material not found');
    const lines = b.lines.map(l => { const m = mats.find(x => x.id === l.stockItemId)!; return { stockItemId: m.id, name: m.name, unit: m.unit, expected: round3(m.qty), counted: l.counted, cost: m.avgCost }; });
    const val = (l: (typeof lines)[number]) => Math.round((l.counted - l.expected) * l.cost);
    const [r] = await tx.insert(schema.stockCounts).values({ venueId, note: b.note, by: s.name, lines,
      shortPaise: lines.reduce((a, l) => a + Math.max(0, -val(l)), 0), extraPaise: lines.reduce((a, l) => a + Math.max(0, val(l)), 0) }).returning();
    const t = await applyChanges(venueId, b.lines.map(l => ({ stockItemId: l.stockItemId, qty: l.counted - mats.find(m => m.id === l.stockItemId)!.qty, kind: 'count' as const, refId: r.id, note: 'Physical count' })), s.name, tx);
    return { row: r, touched: t };
  });
  await syncSoldOut(venueId, touched);
  await audit(s, { action: 'stock_counted', entity: 'stock_count', entityId: row.id, venueId, after: { materials: row.lines.length, shortPaise: row.shortPaise, extraPaise: row.extraPaise } });
  return row;
}
export const countList = (venueId: string) => db().select().from(schema.stockCounts).where(eq(schema.stockCounts.venueId, venueId)).orderBy(desc(schema.stockCounts.at)).limit(30);

// ---------------------------------------------------------------- transfers between branches
export async function transferList(venueId: string) {
  const v = (await db().select({ vendorId: schema.venues.vendorId }).from(schema.venues).where(eq(schema.venues.id, venueId)))[0];
  const [rows, branches] = await Promise.all([
    db().select().from(schema.stockTransfers).where(or(eq(schema.stockTransfers.fromVenueId, venueId), eq(schema.stockTransfers.toVenueId, venueId))).orderBy(desc(schema.stockTransfers.at)).limit(60),
    db().select({ id: schema.venues.id, name: schema.venues.name }).from(schema.venues).where(eq(schema.venues.vendorId, v.vendorId)),
  ]);
  return { branches: branches.filter(b => b.id !== venueId), transfers: rows.map(t => ({ ...t, out: t.fromVenueId === venueId, other: branches.find(b => b.id === (t.fromVenueId === venueId ? t.toVenueId : t.fromVenueId))?.name ?? '' })) };
}
export async function sendTransfer(venueId: string, s: Staff, raw: unknown) {
  const b = z.object({ toVenueId: uuid, note: z.string().trim().max(200).default(''), lines: z.array(z.object({ stockItemId: uuid, qty: z.number().finite().positive('Enter a quantity').max(1e5) })).min(1, 'Add at least one material.').max(60) }).parse(raw);
  const vs = await db().select().from(schema.venues).where(inArray(schema.venues.id, [venueId, b.toVenueId]));
  const from = vs.find(v => v.id === venueId)!, to = vs.find(v => v.id === b.toVenueId);
  if (!to || to.id === from.id || to.vendorId !== from.vendorId) throw bad('Choose another branch of your business.');
  if (new Set(b.lines.map(l => l.stockItemId)).size !== b.lines.length) throw bad('The same material is listed twice.');
  const t = await db().transaction(async tx => {
    const mats = await tx.select().from(schema.stockItems).where(and(eq(schema.stockItems.venueId, venueId), inArray(schema.stockItems.id, b.lines.map(l => l.stockItemId)))).orderBy(asc(schema.stockItems.id)).for('update');
    const lines = b.lines.map(l => { const m = mats.find(x => x.id === l.stockItemId); if (!m) throw bad('Choose a material from this venue.'); if (l.qty > m.qty + 1e-9) throw bad(`Only ${round3(m.qty)} ${m.unit} of ${m.name} is in stock.`); return { stockItemId: m.id, name: m.name, unit: m.unit, qty: l.qty, cost: m.avgCost }; });
    const [row] = await tx.insert(schema.stockTransfers).values({ vendorId: from.vendorId, fromVenueId: from.id, toVenueId: to.id, lines, note: b.note, sentBy: s.name }).returning();
    await applyChanges(venueId, lines.map(l => ({ stockItemId: l.stockItemId, qty: -l.qty, kind: 'sent' as const, refId: row.id, note: `To ${to.name}` })), s.name, tx);
    return row;
  });
  await syncSoldOut(venueId, t.lines.map(l => l.stockItemId));
  await audit(s, { action: 'stock_sent', entity: 'stock_transfer', entityId: t.id, venueId, after: { to: to.name, lines: t.lines } });
  return t;
}
/** The receiving branch confirms what really arrived; a shortfall stays visible on the transfer. */
export async function receiveTransfer(venueId: string, s: Staff, raw: unknown) {
  const b = z.object({ transferId: uuid, lines: z.array(z.object({ stockItemId: uuid, qty: num(1e5) })).min(1) }).parse(raw);
  const touched = await db().transaction(async tx => {
    const t = (await tx.select().from(schema.stockTransfers).where(and(eq(schema.stockTransfers.id, b.transferId), eq(schema.stockTransfers.toVenueId, venueId))).for('update'))[0];
    if (!t) throw notFound('Transfer not found');
    if (t.status !== 'sent') throw bad(`This transfer is already ${t.status}.`);
    const mine = await tx.select().from(schema.stockItems).where(eq(schema.stockItems.venueId, venueId));
    const src = await tx.select().from(schema.stockItems).where(inArray(schema.stockItems.id, t.lines.map(l => l.stockItemId)));
    const changes: Change[] = [], lines = [];
    for (const l of t.lines) {
      const got = b.lines.find(x => x.stockItemId === l.stockItemId)?.qty ?? 0;
      if (got > l.qty + 1e-9) throw bad(`Only ${l.qty} ${l.unit} of ${l.name} was sent.`);
      lines.push({ ...l, received: got });
      if (got <= 0) continue;
      let m = mine.find(x => x.name.trim().toLowerCase() === l.name.trim().toLowerCase() && x.unit === l.unit);
      if (!m) {
        const o = src.find(x => x.id === l.stockItemId);
        [m] = await tx.insert(schema.stockItems).values({ venueId, name: l.name, unit: l.unit, kind: o?.kind ?? 'raw', category: o?.category ?? '', yieldPct: o?.yieldPct ?? 100, shelfDays: o?.shelfDays ?? 0 }).returning();
      }
      changes.push({ stockItemId: m.id, qty: got, kind: 'arrived', totalPaise: got * l.cost, refId: t.id, note: `From another branch` });
    }
    const ids = await applyChanges(venueId, changes, s.name, tx);
    await tx.update(schema.stockTransfers).set({ status: 'received', lines, receivedBy: s.name, receivedAt: new Date() }).where(eq(schema.stockTransfers.id, t.id));
    return ids;
  });
  await syncSoldOut(venueId, touched);
  await audit(s, { action: 'stock_arrived', entity: 'stock_transfer', entityId: b.transferId, venueId, after: { lines: b.lines } });
}
export async function cancelTransfer(venueId: string, s: Staff, id: string) {
  const touched = await db().transaction(async tx => {
    const t = (await tx.select().from(schema.stockTransfers).where(and(eq(schema.stockTransfers.id, id), eq(schema.stockTransfers.fromVenueId, venueId))).for('update'))[0];
    if (!t) throw notFound('Transfer not found');
    if (t.status !== 'sent') throw bad(`This transfer is already ${t.status}.`);
    await tx.update(schema.stockTransfers).set({ status: 'cancelled' }).where(eq(schema.stockTransfers.id, t.id));
    return applyChanges(venueId, t.lines.map(l => ({ stockItemId: l.stockItemId, qty: l.qty, kind: 'sent' as const, refId: t.id, note: 'Transfer cancelled' })), s.name, tx);
  });
  await syncSoldOut(venueId, touched);
  await audit(s, { action: 'transfer_cancelled', entity: 'stock_transfer', entityId: id, venueId });
}
export async function assertBranch(s: Staff, venueId: string) { if (!(await staffCanAccessVenue(s, venueId))) throw forbidden(); }

// ---------------------------------------------------------------- reports
/** Opening + in − out = closing for every material, with rupee values, plus food cost of every dish sold. */
export async function stockReport(venueId: string, from: string, to: string) {
  const { start, end } = dayRange(from, to);
  const [mats, inRange, after, sold, recipes, menu, sales] = await Promise.all([
    materials(venueId),
    db().select({ id: schema.stockMoves.stockItemId, kind: schema.stockMoves.kind, qty: sql<number>`sum(${schema.stockMoves.qty})::float`, value: sql<number>`sum(${schema.stockMoves.qty} * ${schema.stockMoves.unitCost})::float` }).from(schema.stockMoves)
      .where(and(eq(schema.stockMoves.venueId, venueId), gte(schema.stockMoves.at, start), lt(schema.stockMoves.at, end))).groupBy(schema.stockMoves.stockItemId, schema.stockMoves.kind),
    db().select({ id: schema.stockMoves.stockItemId, qty: sql<number>`sum(${schema.stockMoves.qty})::float` }).from(schema.stockMoves).where(and(eq(schema.stockMoves.venueId, venueId), gte(schema.stockMoves.at, end))).groupBy(schema.stockMoves.stockItemId),
    db().select({ itemId: schema.orderItems.itemId, variantId: schema.orderItems.variantId, name: schema.orderItems.name, qty: sql<number>`sum(${schema.orderItems.qty})::int`, sales: sql<number>`sum(${schema.orderItems.qty} * ${schema.orderItems.pricePaise})::float` }).from(schema.orderItems)
      .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id)).where(and(eq(schema.orders.venueId, venueId), isSale(), gte(schema.orders.paidAt, start), lt(schema.orders.paidAt, end)))
      .groupBy(schema.orderItems.itemId, schema.orderItems.variantId, schema.orderItems.name),
    db().select().from(schema.recipes).where(eq(schema.recipes.venueId, venueId)),
    db().select().from(schema.items).where(eq(schema.items.venueId, venueId)),
    db().select({ net: sql<number>`coalesce(sum(${schema.orders.subtotalPaise} - ${schema.orders.discountPaise}), 0)::float` }).from(schema.orders).where(and(eq(schema.orders.venueId, venueId), isSale(), gte(schema.orders.paidAt, start), lt(schema.orders.paidAt, end))),
  ]);
  const rows = mats.map(m => {
    const k = (...kinds: string[]) => inRange.filter(x => x.id === m.id && kinds.includes(x.kind)).reduce((a, x) => ({ qty: a.qty + x.qty, value: a.value + x.value }), { qty: 0, value: 0 });
    const closing = m.qty - (after.find(x => x.id === m.id)?.qty ?? 0);
    const total = inRange.filter(x => x.id === m.id).reduce((a, x) => a + x.qty, 0);
    const c = { bought: k('purchase'), made: k('made'), arrived: k('arrived'), sold: k('sale', 'return'), used: k('used'), wasted: k('wastage'), sent: k('sent'), variance: k('count'), adjusted: k('adjust') };
    return { id: m.id, name: m.name, unit: m.unit, category: m.category, kind: m.kind, opening: round3(closing - total), closing: round3(closing), closingValue: Math.round(closing * m.avgCost),
      ...Object.fromEntries(Object.entries(c).map(([n, v]) => [n, round3(v.qty)])) as Record<keyof typeof c, number>,
      soldValue: Math.round(-c.sold.value), wastedValue: Math.round(-c.wasted.value), varianceValue: Math.round(c.variance.value), boughtValue: Math.round(c.bought.value) };
  });
  const cost = (itemId: string, variantId: string | null) => {
    const dish = recipes.filter(r => r.itemId === itemId && !r.addonId);
    const own = variantId ? dish.filter(r => r.variantId === variantId) : [];
    const ls = own.length ? own : dish.filter(r => !r.variantId);
    return ls.length ? ls.reduce((a, r) => { const m = mats.find(x => x.id === r.stockItemId); return a + (m ? gross(r.qty, m.yieldPct) * m.avgCost : 0); }, 0) : null;
  };
  const dishes = sold.map(x => { const c = x.itemId ? cost(x.itemId, x.variantId) : null; return { name: x.name, qty: x.qty, salesPaise: Math.round(x.sales), costPaise: c === null ? null : Math.round(c * x.qty), pct: c === null || !x.sales ? null : Math.round(c * x.qty / x.sales * 1000) / 10 }; })
    .sort((a, b) => b.salesPaise - a.salesPaise);
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
  const net = sales[0].net, usedCost = sum(r => r.soldValue);
  return {
    from, to, rows, dishes,
    noRecipe: menu.filter(i => i.isLive && !recipes.some(r => r.itemId === i.id && !r.addonId)).map(i => i.name),
    totals: { netSalesPaise: Math.round(net), usedPaise: usedCost, wastedPaise: sum(r => r.wastedValue), variancePaise: sum(r => r.varianceValue), boughtPaise: sum(r => r.boughtValue), closingPaise: sum(r => r.closingValue),
      // What food really cost: recipes + waste + what the count could not find.
      foodCostPct: net ? Math.round((usedCost + sum(r => r.wastedValue) - sum(r => r.varianceValue)) / net * 1000) / 10 : null, recipeCostPct: net ? Math.round(usedCost / net * 1000) / 10 : null },
  };
}

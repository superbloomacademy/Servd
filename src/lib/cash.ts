// Cash drawer: open the day with the cash in the drawer, record cash put in / taken out / spent,
// close with the counted cash. Expected cash = opening + cash sales + cash in − cash out − expenses.
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { bad } from './api';
import type { Staff } from './auth';
import { audit } from './audit';

/** Cash received on GST bills (cash part of split payments too) since a moment. Refunded bills don't count. */
export async function cashSalesSince(venueId: string, since: Date, until = new Date()) {
  const r = await db().execute(sql`
    select coalesce(sum((p->>'amountPaise')::int), 0)::int as cash
    from invoices i, jsonb_array_elements(i.payments) p
    where i.venue_id = ${venueId} and i.status = 'issued' and i.issued_at >= ${since} and i.issued_at < ${until} and p->>'method' = 'cash'`);
  return (r.rows[0] as { cash: number }).cash;
}

export async function drawer(venueId: string) {
  const shift = (await db().select().from(schema.cashShifts)
    .where(and(eq(schema.cashShifts.venueId, venueId), isNull(schema.cashShifts.closedAt))).orderBy(desc(schema.cashShifts.openedAt)).limit(1))[0] ?? null;
  const history = await db().select().from(schema.cashShifts).where(eq(schema.cashShifts.venueId, venueId)).orderBy(desc(schema.cashShifts.openedAt)).limit(10);
  if (!shift) return { shift: null, entries: [], cashSalesPaise: 0, inPaise: 0, outPaise: 0, expensePaise: 0, expectedPaise: 0, history };
  const entries = await db().select().from(schema.cashEntries).where(eq(schema.cashEntries.shiftId, shift.id)).orderBy(desc(schema.cashEntries.at));
  const sum = (k: string) => entries.filter(e => e.kind === k).reduce((a, e) => a + e.amountPaise, 0);
  const cashSales = await cashSalesSince(venueId, shift.openedAt);
  const inP = sum('in'), outP = sum('out'), exp = sum('expense');
  return { shift, entries, cashSalesPaise: cashSales, inPaise: inP, outPaise: outP, expensePaise: exp,
    expectedPaise: shift.openingPaise + cashSales + inP - outP - exp, history };
}

export async function openShift(venueId: string, s: Staff, openingPaise: number) {
  if (!Number.isInteger(openingPaise) || openingPaise < 0) throw bad('Enter the cash in the drawer.');
  const d = await drawer(venueId);
  if (d.shift) throw bad('The drawer is already open. Close it first.');
  const [row] = await db().insert(schema.cashShifts).values({ venueId, openedBy: s.name, openingPaise }).returning();
  await audit(s, { action: 'drawer_opened', entity: 'cash_shift', entityId: row.id, venueId, after: { openingPaise } });
  return row;
}

export async function addCashEntry(venueId: string, s: Staff, e: { kind: 'in' | 'out' | 'expense'; amountPaise: number; category?: string; note?: string }) {
  if (!['in', 'out', 'expense'].includes(e.kind)) throw bad('Choose cash in, cash out or expense.');
  if (!Number.isInteger(e.amountPaise) || e.amountPaise <= 0) throw bad('Enter an amount.');
  if (e.kind !== 'in' && !String(e.note || e.category || '').trim()) throw bad('Say what the cash was for.');
  const d = await drawer(venueId);
  const [row] = await db().insert(schema.cashEntries).values({
    venueId, shiftId: d.shift?.id ?? null, kind: e.kind, amountPaise: e.amountPaise,
    category: String(e.category || '').trim().slice(0, 40), note: String(e.note || '').trim().slice(0, 200), staffName: s.name,
  }).returning();
  await audit(s, { action: `cash_${e.kind}`, entity: 'cash_entry', entityId: row.id, venueId, after: { amountPaise: e.amountPaise, category: row.category, note: row.note } });
  return row;
}

export async function closeShift(venueId: string, s: Staff, countedPaise: number, note: string) {
  if (!Number.isInteger(countedPaise) || countedPaise < 0) throw bad('Enter the cash you counted.');
  const d = await drawer(venueId);
  if (!d.shift) throw bad('The drawer is not open.');
  await db().update(schema.cashShifts).set({ closedAt: new Date(), closedBy: s.name, expectedPaise: d.expectedPaise, countedPaise, note: note.slice(0, 200) })
    .where(eq(schema.cashShifts.id, d.shift.id));
  await audit(s, { action: 'drawer_closed', entity: 'cash_shift', entityId: d.shift.id, venueId,
    after: { expectedPaise: d.expectedPaise, countedPaise, differencePaise: countedPaise - d.expectedPaise } });
  return { expectedPaise: d.expectedPaise, countedPaise, differencePaise: countedPaise - d.expectedPaise };
}


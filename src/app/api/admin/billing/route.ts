import { and, eq, like, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { bad, body, notFound, route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { isMonth, monthLabel, monthlyDues, thisMonth } from '@/lib/admin';

// Monthly platform billing: what each vendor owes us (commission + fee) and whether they've paid.
export const GET = route(async req => {
  await requireStaff(['super_admin']);
  const q = new URL(req.url).searchParams.get('month');
  const month = isMonth(q) ? q : thisMonth();
  const [dues, vendors, bills] = await Promise.all([
    monthlyDues(month),
    db().select().from(schema.vendors),
    db().select().from(schema.platformBills).where(eq(schema.platformBills.month, month)),
  ]);
  const rows = [...dues.values()].map(d => {
    const v = vendors.find(x => x.id === d.vendorId)!;
    const bill = bills.find(b => b.vendorId === d.vendorId) ?? null;
    return { ...d, vendorName: v.name, brandColor: v.brandColor, vendorStatus: v.status, monthlyFeeSet: v.monthlyFeePaise, bill };
  }).sort((a, b) => b.totalPaise - a.totalPaise);
  // A recorded bill is frozen; otherwise the live numbers count.
  const amount = (r: typeof rows[number]) => r.bill ? r.bill.totalPaise : r.totalPaise;
  return {
    month, label: monthLabel(month), isCurrent: month === thisMonth(), rows,
    totals: {
      sales: rows.reduce((a, r) => a + r.salesPaise, 0),
      due: rows.filter(r => !r.bill || r.bill.status === 'due').reduce((a, r) => a + amount(r), 0),
      collected: rows.filter(r => r.bill?.status === 'paid').reduce((a, r) => a + amount(r), 0),
      waived: rows.filter(r => r.bill?.status === 'waived').reduce((a, r) => a + amount(r), 0),
    },
  };
});

const Act = z.object({
  vendorId: z.string().uuid(),
  month: z.string().refine(isMonth, 'Choose a month'),
  action: z.enum(['record', 'mark_paid', 'waive', 'mark_due']),
  reference: z.string().trim().max(80).optional(),
});

// record = freeze this month's numbers as a bill; mark_paid / waive / mark_due change its status.
export const POST = route(async req => {
  const s = await requireStaff(['super_admin']);
  const b = Act.parse(await body(req));
  const due = (await monthlyDues(b.month)).get(b.vendorId);
  if (!due) throw notFound('Vendor not found for this month');
  let bill = (await db().select().from(schema.platformBills).where(and(eq(schema.platformBills.vendorId, b.vendorId), eq(schema.platformBills.month, b.month))))[0];
  if (!bill) {
    if (b.month > thisMonth()) throw bad('That month hasn’t started yet.');
    const n = (await db().select({ n: sql<number>`count(*)::int` }).from(schema.platformBills).where(like(schema.platformBills.number, `SV-${b.month.replace('-', '').slice(2)}-%`)))[0].n;
    [bill] = await db().insert(schema.platformBills).values({
      vendorId: b.vendorId, month: b.month, number: `SV-${b.month.replace('-', '').slice(2)}-${String(n + 1).padStart(3, '0')}`,
      orders: due.orders, salesPaise: due.salesPaise, qrPaise: due.qrPaise, onlinePaise: due.onlinePaise, cashPaise: due.cashPaise,
      commissionBps: due.commissionBps, commissionPaise: due.commissionPaise, commissionCapPaise: due.capped ? due.commissionCapPaise : null, feePaise: due.feePaise, totalPaise: due.totalPaise,
    }).returning();
  }
  if (b.action !== 'record') {
    const status = b.action === 'mark_paid' ? 'paid' : b.action === 'waive' ? 'waived' : 'due';
    [bill] = await db().update(schema.platformBills).set({
      status, paidAt: status === 'paid' ? new Date() : null, reference: status === 'paid' ? (b.reference || null) : bill.reference,
    }).where(eq(schema.platformBills.id, bill.id)).returning();
  }
  await audit(s, { action: `platform_bill_${b.action}`, entity: 'platform_bill', entityId: bill.id, vendorId: b.vendorId,
    after: { month: b.month, number: bill.number, totalPaise: bill.totalPaise, status: bill.status, reference: bill.reference } });
  return { bill };
});

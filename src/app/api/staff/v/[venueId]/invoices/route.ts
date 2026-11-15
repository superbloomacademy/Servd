import { and, desc, eq, gte, lt } from 'drizzle-orm';
import { db, schema } from '@/db';
import { route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { CAN } from '@/lib/roles';
import { isMonth, monthLabel, monthRange, thisMonth } from '@/lib/admin';

// GST bills of one venue for a month, with totals for GST filing. ?format=csv downloads it for the accountant.
export const GET = route<{ venueId: string }>(async (req, { venueId }) => {
  await requireVenueAccess(venueId, CAN.reports);
  const p = new URL(req.url).searchParams;
  const month = isMonth(p.get('month')) ? p.get('month')! : thisMonth();
  const { start, end } = monthRange(month);
  const rows = await db().select().from(schema.invoices)
    .where(and(eq(schema.invoices.venueId, venueId), gte(schema.invoices.issuedAt, start), lt(schema.invoices.issuedAt, end)))
    .orderBy(desc(schema.invoices.issuedAt));
  const issued = rows.filter(r => r.status === 'issued');
  const sum = (k: 'taxablePaise' | 'cgstPaise' | 'sgstPaise' | 'totalPaise' | 'discountPaise', list = issued) => list.reduce((a, r) => a + r[k], 0);
  const rates = [...new Set(issued.map(r => r.taxBps))].sort((a, b) => a - b).map(bps => {
    const l = issued.filter(r => r.taxBps === bps);
    return { taxBps: bps, bills: l.length, taxable: sum('taxablePaise', l), cgst: sum('cgstPaise', l), sgst: sum('sgstPaise', l), total: sum('totalPaise', l) };
  });

  if (p.get('format') === 'csv') {
    const rupees = (x: number) => (x / 100).toFixed(2);
    const esc = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    const fmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' });
    const lines = [
      'Bill No,Date,Status,Place,KOT,Payment,Sub total,Discount,Taxable value,GST %,CGST,SGST,Total',
      ...[...rows].reverse().map(r => [r.number, fmt.format(r.issuedAt), r.status, r.spotLabel, r.kotNos.join(' '), r.payMethod === 'cash' ? 'Cash' : 'UPI',
        rupees(r.subtotalPaise), rupees(r.discountPaise), rupees(r.taxablePaise), String(r.taxBps / 100), rupees(r.cgstPaise), rupees(r.sgstPaise), rupees(r.totalPaise)].map(esc).join(',')),
      '',
      `Totals (issued bills only),,,,,,,${rupees(sum('discountPaise'))},${rupees(sum('taxablePaise'))},,${rupees(sum('cgstPaise'))},${rupees(sum('sgstPaise'))},${rupees(sum('totalPaise'))}`,
    ];
    return new Response('﻿' + lines.join('\r\n'), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="gst-bills-${month}.csv"` },
    });
  }

  return {
    month, label: monthLabel(month), isCurrent: month === thisMonth(),
    totals: { bills: issued.length, cancelled: rows.length - issued.length, taxable: sum('taxablePaise'), cgst: sum('cgstPaise'), sgst: sum('sgstPaise'), total: sum('totalPaise'), discount: sum('discountPaise') },
    rates,
    invoices: rows.slice(0, 300).map(r => ({ id: r.id, number: r.number, issuedAt: r.issuedAt, status: r.status, spotLabel: r.spotLabel, kotNos: r.kotNos, payMethod: r.payMethod, taxablePaise: r.taxablePaise, cgstPaise: r.cgstPaise, sgstPaise: r.sgstPaise, totalPaise: r.totalPaise })),
  };
});

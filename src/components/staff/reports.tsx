'use client';
import { useEffect, useState } from 'react';
import { AlertTriangle, Download, Printer } from 'lucide-react';
import { api, clock, rupee } from '@/lib/client';
import { Pill, Spinner } from '@/components/ui/kit';
import { PageHead } from './shell';
import { CHANNEL_LABEL, PAY_LABEL, type Channel, type VenueCtx } from './types';

type R = {
  from: string; to: string;
  bills: { bills: number; subtotal: number; discount: number; taxable: number; cgst: number; sgst: number; roundOff: number; total: number };
  cancelledBills: { n: number; total: number };
  payments: { method: string; bills: number; amount: number }[];
  channels: { channel: Channel; fulfilment: string; orders: number; amount: number }[];
  items: { category: string; name: string; qty: number; amount: number }[];
  categories: { category: string; qty: number; amount: number }[];
  staff: { name: string; orders: number; amount: number }[];
  discounts: { kotNo: number; spot: string; amount: number; coupon: string | null; reason: string | null; at: string }[];
  cancels: { at: string; action: string; by: string | null; kotNo?: number; spot?: string; name?: string; qty?: number; amountPaise?: number; reason?: string; paid?: boolean }[];
  cash: { entries: { id: string; kind: string; category: string; amountPaise: number; note: string; staffName: string; at: string }[]; inPaise: number; outPaise: number; expensePaise: number };
  shifts: { id: string; openedBy: string; openedAt: string; openingPaise: number; closedAt: string | null; expectedPaise: number | null; countedPaise: number | null }[];
  covers: { tables: number; guests: number };
  open: { unpaid: { id: string; kotNo: number; spot: string; total: number }[]; tables: number };
};

const iso = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
const FULFIL: Record<string, string> = { table: 'Dine-in', pickup: 'Takeaway / counter', delivery: 'Delivery', seat: 'Seat delivery' };

export function Reports({ venue }: { venue: VenueCtx }) {
  const today = iso(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [r, setR] = useState<R | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setR(null); setErr('');
    api<R>(`/api/staff/v/${venue.id}/reports?from=${from}&to=${to}`).then(setR).catch(e => setErr(e.message));
  }, [venue.id, from, to]);

  const preset = (days: number, back = 0) => { const end = new Date(Date.now() - back * 864e5); setTo(iso(end)); setFrom(iso(new Date(end.getTime() - days * 864e5))); };
  const csv = () => {
    if (!r) return;
    const rows: (string | number)[][] = [[`${venue.name} sales report`, `${r.from} to ${r.to}`], [],
      ['Summary'], ['Bills', r.bills.bills], ['Items value', r.bills.subtotal / 100], ['Discount', r.bills.discount / 100], ['Taxable value', r.bills.taxable / 100],
      ['CGST', r.bills.cgst / 100], ['SGST', r.bills.sgst / 100], ['Round off', r.bills.roundOff / 100], ['Total sales', r.bills.total / 100],
      ['Cancelled bills', r.cancelledBills.n, r.cancelledBills.total / 100], [],
      ['Payment mode', 'Bills', 'Amount'], ...r.payments.map(p => [PAY_LABEL[p.method] || p.method, p.bills, p.amount / 100]), [],
      ['Source', 'Type', 'Orders', 'Amount'], ...r.channels.map(c => [CHANNEL_LABEL[c.channel], FULFIL[c.fulfilment] || c.fulfilment, c.orders, c.amount / 100]), [],
      ['Category', 'Item', 'Qty', 'Amount (before GST)'], ...r.items.map(i => [i.category, i.name, i.qty, i.amount / 100]), [],
      ['Staff', 'Bills', 'Amount'], ...r.staff.map(s => [s.name, s.orders, s.amount / 100]), [],
      ['Discounts', 'KOT', 'Where', 'Amount', 'Reason'], ...r.discounts.map(d => ['', d.kotNo, d.spot, d.amount / 100, d.reason || d.coupon || '']), [],
      ['Cancellations', 'Time', 'KOT', 'Item', 'Qty', 'Amount', 'Reason', 'By'],
      ...r.cancels.map(c => ['', clock(c.at), c.kotNo ?? '', c.name || 'Whole order', c.qty ?? '', (c.amountPaise ?? 0) / 100, c.reason || '', c.by || '']), [],
      ['Cash entries', 'Type', 'Category', 'Amount', 'Note', 'By'], ...r.cash.entries.map(e => ['', e.kind, e.category, e.amountPaise / 100, e.note, e.staffName]),
    ];
    const text = rows.map(row => row.map(c => { const s = String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' }));
    a.download = `sales-${venue.name.replace(/\W+/g, '-').toLowerCase()}-${r.from}${r.to !== r.from ? '-to-' + r.to : ''}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <PageHead title="Day-end reports" sub="Sales, GST, payment modes, items, discounts and cancellations. Print the day-end (Z) report or download it for your accountant."
        right={<>
          <div className="flex rounded-xl bg-white p-1 text-sm font-semibold">
            <button onClick={() => preset(0)} className={`rounded-lg px-3 py-1.5 ${from === today && to === today ? 'bg-ink text-white' : 'text-muted'}`}>Today</button>
            <button onClick={() => preset(0, 1)} className={`rounded-lg px-3 py-1.5 ${from === iso(new Date(Date.now() - 864e5)) && from === to ? 'bg-ink text-white' : 'text-muted'}`}>Yesterday</button>
            <button onClick={() => preset(6)} className="rounded-lg px-3 py-1.5 text-muted">7 days</button>
          </div>
          <input type="date" value={from} max={to} onChange={e => e.target.value && setFrom(e.target.value)} aria-label="From" className="rounded-xl border border-line bg-white px-2.5 py-2 text-sm" />
          <input type="date" value={to} min={from} max={today} onChange={e => e.target.value && setTo(e.target.value)} aria-label="To" className="rounded-xl border border-line bg-white px-2.5 py-2 text-sm" />
          <a href={`/print/day/${venue.id}?from=${from}&to=${to}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-xl bg-ink px-3.5 py-2.5 text-sm font-semibold text-white"><Printer size={15} />Print Z report</a>
          <button onClick={csv} disabled={!r} className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm font-semibold"><Download size={15} />Excel (CSV)</button>
        </>} />
      {err && <p className="rounded-xl bg-[#FDECEE] p-4 text-sm text-bad">{err}</p>}
      {!r && !err ? <div className="grid place-items-center py-24"><Spinner className="text-muted" /></div> : r && (
        <div className="space-y-4">
          {(r.open.unpaid.length > 0 || r.open.tables > 0) && (
            <div className="flex items-start gap-3 rounded-2xl border border-[#F5D7A9] bg-[#FFF8EC] p-4 text-sm text-[#7A4A00]">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div><b>Still open right now:</b> {r.open.tables} running table{r.open.tables === 1 ? '' : 's'}{r.open.unpaid.length ? `, ${r.open.unpaid.length} unpaid counter order${r.open.unpaid.length === 1 ? '' : 's'} (${r.open.unpaid.map(u => `KOT ${u.kotNo}`).join(', ')})` : ''}. Settle them before closing the day; they’re not in the totals yet.</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi label="Total sales" value={rupee(r.bills.total)} sub="incl. GST" big />
            <Kpi label="Bills" value={String(r.bills.bills)} sub={r.bills.bills ? `avg ${rupee(Math.round(r.bills.total / r.bills.bills))}` : '—'} />
            <Kpi label="Guests (dine-in)" value={String(r.covers.guests)} sub={`${r.covers.tables} tables${r.covers.guests ? ` · ${rupee(Math.round(r.channels.filter(c => c.fulfilment === 'table').reduce((a, c) => a + c.amount, 0) / r.covers.guests))}/guest` : ''}`} />
            <Kpi label="Discounts" value={rupee(r.bills.discount)} sub={`${r.discounts.length} bills`} />
            <Kpi label="Cancelled" value={String(r.cancels.length)} sub={r.cancelledBills.n ? `${r.cancelledBills.n} bills refunded ${rupee(r.cancelledBills.total)}` : 'items + orders'} />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card title="Tax summary">
              <Rows rows={[['Items value', r.bills.subtotal], ['Discount', -r.bills.discount], ['Taxable value', r.bills.taxable], ['CGST', r.bills.cgst], ['SGST', r.bills.sgst], ['Round off', r.bills.roundOff]]} />
              <div className="tabular mt-2 flex justify-between border-t border-line pt-2 font-extrabold"><span>Total</span><span>{rupee(r.bills.total)}</span></div>
            </Card>
            <Card title="Payment modes">
              <Share list={r.payments.map(p => ({ label: PAY_LABEL[p.method] || p.method, amount: p.amount, sub: `${p.bills} bills` }))} />
            </Card>
            <Card title="Where orders came from">
              <Share list={r.channels.map(c => ({ label: `${c.channel === 'qr' ? 'Guest QR' : CHANNEL_LABEL[c.channel]} · ${FULFIL[c.fulfilment] || c.fulfilment}`, amount: c.amount, sub: `${c.orders} orders` }))} />
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
            <Card title="Categories">
              <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted"><th className="py-1">Category</th><th className="text-right">Qty</th><th className="text-right">Amount</th></tr></thead>
                <tbody className="tabular">{r.categories.map(c => <tr key={c.category} className="border-t border-line"><td className="py-1.5">{c.category}</td><td className="text-right">{c.qty}</td><td className="text-right">{rupee(c.amount)}</td></tr>)}</tbody></table>
              {!r.categories.length && <p className="text-sm text-muted">No sales.</p>}
            </Card>
            <Card title="Items sold">
              <div className="max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm"><thead className="sticky top-0 bg-white"><tr className="text-left text-xs text-muted"><th className="py-1">Item</th><th>Category</th><th className="text-right">Qty</th><th className="text-right">Amount</th></tr></thead>
                  <tbody className="tabular">{[...r.items].sort((a, b) => b.qty - a.qty).map(i => <tr key={i.category + i.name} className="border-t border-line"><td className="py-1.5">{i.name}</td><td className="text-muted">{i.category}</td><td className="text-right font-semibold">{i.qty}</td><td className="text-right">{rupee(i.amount)}</td></tr>)}</tbody></table>
              </div>
              <p className="mt-2 text-xs text-muted">Amounts are before discount and GST.</p>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card title={`Cancellations (${r.cancels.length})`} hint="Every item cancelled after the KOT and every rejected order, with who did it and why.">
              <ul className="divide-y divide-line text-sm">
                {r.cancels.map((c, i) => (
                  <li key={i} className="flex gap-3 py-2">
                    <span className="tabular w-16 shrink-0 text-xs text-muted">{clock(c.at)}</span>
                    <span className="flex-1">{c.action === 'item_cancelled' ? <><b>{c.qty} × {c.name}</b> · KOT {c.kotNo}</> : <><b>Whole order</b> · KOT {c.kotNo}{c.paid ? <Pill tone="bad" className="ml-1">refund</Pill> : null}</>}
                      <span className="block text-xs text-muted">{c.reason} · by {c.by}</span></span>
                    {c.amountPaise ? <span className="tabular shrink-0">{rupee(c.amountPaise)}</span> : null}
                  </li>
                ))}
                {!r.cancels.length && <li className="py-2 text-muted">No cancellations.</li>}
              </ul>
            </Card>
            <Card title={`Discounts (${r.discounts.length})`}>
              <ul className="divide-y divide-line text-sm">
                {r.discounts.map((d, i) => <li key={i} className="flex justify-between gap-3 py-2"><span>KOT {d.kotNo} · {d.spot}<span className="block text-xs text-muted">{d.reason || (d.coupon ? `Coupon ${d.coupon}` : '')}</span></span><span className="tabular">{rupee(d.amount)}</span></li>)}
                {!r.discounts.length && <li className="py-2 text-muted">No discounts.</li>}
              </ul>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card title="Staff (who took the payment)">
              <ul className="divide-y divide-line text-sm">{r.staff.map(s => <li key={s.name} className="tabular flex justify-between py-2"><span>{s.name}</span><span>{s.orders} bills · {rupee(s.amount)}</span></li>)}
                {!r.staff.length && <li className="py-2 text-muted">No sales.</li>}</ul>
            </Card>
            <Card title="Cash drawer">
              <Rows rows={[['Cash put in', r.cash.inPaise], ['Cash taken out', -r.cash.outPaise], ['Expenses', -r.cash.expensePaise]]} />
              {r.shifts.map(s => {
                const diff = s.countedPaise != null && s.expectedPaise != null ? s.countedPaise - s.expectedPaise : null;
                return <p key={s.id} className="mt-2 rounded-xl bg-soft px-3 py-2 text-sm">Opened {clock(s.openedAt)} by {s.openedBy} with {rupee(s.openingPaise)}
                  {s.closedAt ? <> · closed {clock(s.closedAt)} · expected {rupee(s.expectedPaise!)} · counted {rupee(s.countedPaise!)} · <b className={diff === 0 ? 'text-good' : 'text-bad'}>{diff === 0 ? 'matches' : diff! > 0 ? `${rupee(diff!)} extra` : `${rupee(-diff!)} short`}</b></> : ' · still open'}</p>;
              })}
              {r.cash.entries.filter(e => e.kind === 'expense').length > 0 && <ul className="mt-2 divide-y divide-line text-sm">{r.cash.entries.filter(e => e.kind === 'expense').map(e => <li key={e.id} className="tabular flex justify-between py-1.5"><span>{e.category || 'Expense'}{e.note ? ` · ${e.note}` : ''}</span><span>{rupee(e.amountPaise)}</span></li>)}</ul>}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, big }: { label: string; value: string; sub: string; big?: boolean }) {
  return <div className={`rounded-2xl bg-white p-4 ${big ? 'ring-2 ring-brand-line' : ''}`}><p className="text-[13px] font-semibold text-muted">{label}</p><p className="tabular mt-1 text-2xl font-extrabold">{value}</p><p className="mt-0.5 text-xs text-muted">{sub}</p></div>;
}
function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <section className="rounded-2xl bg-white p-5"><h2 className="font-bold">{title}</h2>{hint && <p className="text-xs text-muted">{hint}</p>}<div className="mt-3">{children}</div></section>;
}
function Rows({ rows }: { rows: [string, number][] }) {
  return <div className="tabular space-y-1 text-sm">{rows.map(([l, v]) => <div key={l} className="flex justify-between"><span className="text-ink-2">{l}</span><span>{v < 0 ? `−${rupee(-v)}` : rupee(v)}</span></div>)}</div>;
}
function Share({ list }: { list: { label: string; amount: number; sub: string }[] }) {
  const total = Math.max(1, list.reduce((a, x) => a + x.amount, 0));
  if (!list.length) return <p className="text-sm text-muted">No sales.</p>;
  return (
    <ul className="space-y-3">
      {list.map((x, i) => (
        <li key={x.label}>
          <div className="flex justify-between gap-2 text-sm"><span className="font-semibold">{x.label}</span><span className="tabular">{rupee(x.amount)} <span className="text-muted">· {Math.round((x.amount / total) * 100)}%</span></span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-soft"><div className="h-full rounded-full" style={{ width: `${(x.amount / total) * 100}%`, background: i === 0 ? 'var(--brand)' : '#3D4152' }} /></div>
          <p className="text-xs text-muted">{x.sub}</p>
        </li>
      ))}
    </ul>
  );
}

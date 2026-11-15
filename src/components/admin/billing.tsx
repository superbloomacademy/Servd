'use client';
import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { api, rupee } from '@/lib/client';
import { Btn, Pill, Spinner } from '@/components/ui/kit';
import { useConfirm, useToast } from '@/components/ui/providers';
import { Kpi, Logo, PageHead, pct } from './common';
import type { Nav } from './super-admin';

type Bill = { id: string; number: string; totalPaise: number; status: 'due' | 'paid' | 'waived'; paidAt: string | null; reference: string | null };
type Row = {
  vendorId: string; vendorName: string; brandColor: string; vendorStatus: string; orders: number; salesPaise: number; onlinePaise: number; cashPaise: number;
  commissionBps: number; commissionPaise: number; feePaise: number; totalPaise: number; trialNote: string | null; bill: Bill | null;
};
type Data = { month: string; label: string; isCurrent: boolean; rows: Row[]; totals: { sales: number; due: number; collected: number; waived: number } };

const shift = (m: string, by: number) => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };

// What each vendor owes us per month. Testing phase: vendors pay us by UPI/bank transfer; we mark it here.
export function Billing({ nav }: { nav: Nav }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [month, setMonth] = useState<string | null>(null);
  const [d, setD] = useState<Data | null>(null);
  const load = useCallback((m?: string | null) => api<Data>(`/api/admin/billing${m ? `?month=${m}` : ''}`).then(r => { setD(r); setMonth(r.month); }), []);
  useEffect(() => { load(); }, [load]);
  if (!d) return <div className="grid place-items-center py-24"><Spinner className="text-muted" /></div>;

  const act = async (r: Row, action: 'record' | 'mark_paid' | 'waive' | 'mark_due') => {
    const amount = rupee(r.bill?.totalPaise ?? r.totalPaise);
    const text = {
      record: { t: `Record ${d.label} bill for ${r.vendorName}?`, b: <>The amount is frozen at <b>{amount}</b> and gets a bill number you can send them. Later orders in this month won’t change it.</>, c: 'Record bill' },
      mark_paid: { t: `Mark ${amount} as received from ${r.vendorName}?`, b: 'Only after the money is in our bank account. Enter the UPI / bank reference so it can be traced.', c: 'Mark as paid' },
      waive: { t: `Waive ${amount} for ${r.vendorName}?`, b: 'They won’t have to pay this month’s bill. Use for goodwill or a disputed month.', c: 'Waive bill' },
      mark_due: { t: `Mark ${r.vendorName}’s bill as unpaid again?`, b: 'Use this if a payment was marked by mistake.', c: 'Mark as due' },
    }[action];
    const res = await confirm({ title: text.t, body: text.b, confirm: text.c, tone: action === 'waive' || action === 'mark_due' ? 'danger' : 'primary', ...(action === 'mark_paid' ? { input: { label: 'Payment reference (UTR / note)', placeholder: 'e.g. UPI ref 4321…', required: true } } : {}) });
    if (!res) return;
    try { await api('/api/admin/billing', { body: { vendorId: r.vendorId, month: d.month, action, reference: res.value } }); toast('Saved'); load(month); }
    catch (e) { toast((e as Error).message, 'bad'); }
  };

  return (
    <div>
      <PageHead title="Billing" sub="What each vendor owes the platform: commission on paid orders plus any monthly fee. Vendors keep all customer money; they pay us this bill."
        right={
          <div className="flex items-center gap-1 rounded-xl bg-white p-1">
            <button className="rounded-lg p-2 hover:bg-soft" aria-label="Previous month" onClick={() => load(shift(d.month, -1))}><ChevronLeft size={18} /></button>
            <span className="min-w-[130px] text-center text-sm font-bold">{d.label}</span>
            <button className="rounded-lg p-2 hover:bg-soft disabled:opacity-30" aria-label="Next month" disabled={d.isCurrent} onClick={() => load(shift(d.month, 1))}><ChevronRight size={18} /></button>
          </div>
        } />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Vendor sales" value={rupee(d.totals.sales)} sub="paid orders, all vendors" />
        <Kpi label={d.isCurrent ? 'Earned so far' : 'To collect'} value={rupee(d.totals.due)} sub={d.isCurrent ? 'month still running' : 'not paid yet'} tone="brand" />
        <Kpi label="Collected" value={rupee(d.totals.collected)} sub="marked as paid" />
        <Kpi label="Waived" value={rupee(d.totals.waived)} />
      </div>
      {d.isCurrent && <p className="mb-3 rounded-xl bg-[#FFF3E0] px-4 py-2.5 text-sm text-[#9A5500]">This month isn’t over. Numbers change as orders come in. Record bills after the month ends.</p>}

      <div className="overflow-x-auto rounded-2xl bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-muted">
            <th className="px-4 py-2.5 font-semibold">Vendor</th><th className="px-2 text-right font-semibold">Sales</th><th className="px-2 text-right font-semibold">Cash</th>
            <th className="px-2 text-right font-semibold">Commission</th><th className="px-2 text-right font-semibold">Fee</th><th className="px-2 text-right font-semibold">Total</th>
            <th className="px-2 font-semibold">Status</th><th className="px-4" />
          </tr></thead>
          <tbody>
            {d.rows.map(r => {
              const s = r.bill?.status;
              return (
                <tr key={r.vendorId} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <button onClick={() => nav.go('vendors', { vendor: r.vendorId })} className="flex items-center gap-2.5 text-left">
                      <Logo name={r.vendorName} color={r.brandColor} size={32} />
                      <span><b className="block font-semibold">{r.vendorName}</b><span className="text-xs text-muted">{r.orders} orders{r.trialNote ? ` · ${r.trialNote}` : ''}</span></span>
                    </button>
                  </td>
                  <td className="tabular px-2 text-right">{rupee(r.salesPaise)}</td>
                  <td className="tabular px-2 text-right text-muted">{r.salesPaise ? Math.round((r.cashPaise / r.salesPaise) * 100) : 0}%</td>
                  <td className="tabular px-2 text-right">{rupee(r.commissionPaise)}<span className="block text-xs text-muted">{pct(r.commissionBps)}</span></td>
                  <td className="tabular px-2 text-right">{rupee(r.feePaise)}</td>
                  <td className="tabular px-2 text-right font-bold">{rupee(r.bill?.totalPaise ?? r.totalPaise)}{r.bill && r.bill.totalPaise !== r.totalPaise && <span className="block text-[11px] font-normal text-muted">recorded</span>}</td>
                  <td className="px-2">{!r.bill ? <Pill tone="neutral">Not recorded</Pill> : s === 'paid' ? <Pill tone="good">Paid</Pill> : s === 'waived' ? <Pill tone="neutral">Waived</Pill> : <Pill tone="warn">Due</Pill>}
                    {r.bill?.reference && <span className="block text-[11px] text-muted">ref {r.bill.reference}</span>}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      {!r.bill && !d.isCurrent && <Btn size="sm" tone="outline" disabled={!r.totalPaise} onClick={() => act(r, 'record')}>Record bill</Btn>}
                      {(!r.bill || s === 'due') && (r.bill || !d.isCurrent) && <Btn size="sm" tone="good" disabled={!(r.bill?.totalPaise ?? r.totalPaise)} onClick={() => act(r, 'mark_paid')}>Paid</Btn>}
                      {r.bill && s === 'due' && <Btn size="sm" tone="ghost" onClick={() => act(r, 'waive')}>Waive</Btn>}
                      {r.bill && s !== 'due' && <Btn size="sm" tone="ghost" onClick={() => act(r, 'mark_due')}>Undo</Btn>}
                      {r.bill && <a href={`/print/platform-bill/${r.bill.id}`} target="_blank" className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[13px] font-semibold hover:bg-soft"><FileText size={13} />Bill</a>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!d.rows.length && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">No vendors in this month.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

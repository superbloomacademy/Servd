'use client';
import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, ReceiptText } from 'lucide-react';
import { api, rupee } from '@/lib/client';
import { Empty, Pill, Spinner } from '@/components/ui/kit';
import { PageHead } from './shell';
import type { VenueCtx } from './types';

type Inv = { id: string; number: string; issuedAt: string; status: 'issued' | 'cancelled'; spotLabel: string; kotNos: number[]; payMethod: string; taxablePaise: number; cgstPaise: number; sgstPaise: number; totalPaise: number };
type Data = {
  month: string; label: string; isCurrent: boolean; invoices: Inv[];
  totals: { bills: number; cancelled: number; taxable: number; cgst: number; sgst: number; total: number; discount: number };
  rates: { taxBps: number; bills: number; taxable: number; cgst: number; sgst: number; total: number }[];
};
type PBill = { id: string; month: string; number: string; totalPaise: number; status: string; reference: string | null };
const shift = (m: string, by: number) => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };

// Owner / manager: every GST bill for the month, totals for GST filing, and a download for the accountant.
export function GstBills({ venue, isOwner }: { venue: VenueCtx; isOwner: boolean }) {
  const [d, setD] = useState<Data | null>(null);
  const [ours, setOurs] = useState<{ bills: PBill[]; thisMonth: { totalPaise: number; commissionPaise: number; feePaise: number; trialNote: string | null } | null } | null>(null);
  const load = useCallback((m?: string) => api<Data>(`/api/staff/v/${venue.id}/invoices${m ? `?month=${m}` : ''}`).then(setD), [venue.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (isOwner) api(`/api/staff/platform-bills?vendorId=${venue.vendorId}`).then(setOurs).catch(() => {}); }, [isOwner, venue.vendorId]);
  if (!d) return <div className="grid place-items-center py-24"><Spinner className="text-muted" /></div>;
  const t = d.totals;

  return (
    <div>
      <PageHead title="GST bills" sub="Every paid order gets a numbered GST bill automatically. Give the download to your accountant for GST filing."
        right={<>
          <div className="flex items-center gap-1 rounded-xl bg-white p-1">
            <button className="rounded-lg p-2 hover:bg-soft" aria-label="Previous month" onClick={() => load(shift(d.month, -1))}><ChevronLeft size={18} /></button>
            <span className="min-w-[120px] text-center text-sm font-bold">{d.label}</span>
            <button className="rounded-lg p-2 hover:bg-soft disabled:opacity-30" aria-label="Next month" disabled={d.isCurrent} onClick={() => load(shift(d.month, 1))}><ChevronRight size={18} /></button>
          </div>
          <a href={`/api/staff/v/${venue.id}/invoices?month=${d.month}&format=csv`} className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-black"><Download size={16} />Download (Excel)</a>
        </>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[['Bills', String(t.bills), t.cancelled ? `${t.cancelled} cancelled` : 'none cancelled'], ['Taxable value', rupee(t.taxable), t.discount ? `after ${rupee(t.discount)} discounts` : ''], ['CGST', rupee(t.cgst), ''], ['SGST', rupee(t.sgst), ''], ['Total billed', rupee(t.total), 'incl. GST']].map(([l, v, s]) => (
          <div key={l} className="rounded-2xl bg-white p-4"><p className="text-[13px] font-semibold text-muted">{l}</p><p className="tabular mt-1 text-xl font-extrabold">{v}</p>{s && <p className="text-xs text-muted">{s}</p>}</div>
        ))}
      </div>

      {d.rates.length > 1 && (
        <section className="mt-4 rounded-2xl bg-white p-5 text-sm">
          <h2 className="mb-2 font-bold">By GST rate</h2>
          {d.rates.map(r => <div key={r.taxBps} className="tabular flex justify-between border-t border-line py-2 first:border-0"><span>{r.taxBps / 100}% · {r.bills} bills</span><span>taxable {rupee(r.taxable)} · CGST {rupee(r.cgst)} · SGST {rupee(r.sgst)}</span></div>)}
        </section>
      )}

      <section className="mt-4 overflow-x-auto rounded-2xl bg-white">
        {!d.invoices.length ? <Empty icon={<ReceiptText />} title="No bills this month">Bills appear here as soon as payments are confirmed.</Empty> : (
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="px-4 py-2.5 font-semibold">Bill no.</th><th className="font-semibold">Date</th><th className="font-semibold">Place · KOT</th><th className="text-right font-semibold">Taxable</th><th className="text-right font-semibold">GST</th><th className="text-right font-semibold">Total</th><th className="px-4" /></tr></thead>
            <tbody>
              {d.invoices.map(i => (
                <tr key={i.id} className={`border-b border-line last:border-0 ${i.status === 'cancelled' ? 'text-muted line-through' : ''}`}>
                  <td className="px-4 py-2 font-mono text-[13px]">{i.number}</td>
                  <td>{new Date(i.issuedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                  <td className="text-ink-2">{i.spotLabel} · {i.kotNos.join(', ')} {i.status === 'cancelled' && <Pill tone="bad">Cancelled</Pill>}</td>
                  <td className="tabular text-right">{rupee(i.taxablePaise)}</td>
                  <td className="tabular text-right">{rupee(i.cgstPaise + i.sgstPaise)}</td>
                  <td className="tabular text-right font-semibold">{rupee(i.totalPaise)}</td>
                  <td className="px-4 text-right"><a href={`/print/invoice/${i.id}`} target="_blank" rel="noopener" className="text-xs font-semibold text-brand-text no-underline">View</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {isOwner && ours && (
        <section className="mt-6 rounded-2xl bg-white p-5">
          <h2 className="font-bold">Your bills from Servd</h2>
          <p className="text-xs text-muted">Platform commission and monthly fee. Customer payments always go straight to you.</p>
          {ours.thisMonth && <p className="mt-3 rounded-xl bg-soft px-3 py-2 text-sm">This month so far: <b>{rupee(ours.thisMonth.totalPaise)}</b>{ours.thisMonth.trialNote ? ` · ${ours.thisMonth.trialNote}` : ''}</p>}
          <ul className="mt-2 divide-y divide-line text-sm">
            {ours.bills.map(b => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                <span><b className="font-semibold">{new Date(`${b.month}-15`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</b><span className="block text-xs text-muted">{b.number}</span></span>
                <span className="flex items-center gap-2"><span className="tabular font-bold">{rupee(b.totalPaise)}</span><Pill tone={b.status === 'paid' ? 'good' : b.status === 'waived' ? 'neutral' : 'warn'}>{b.status === 'paid' ? 'Paid' : b.status === 'waived' ? 'Waived' : 'Due'}</Pill>
                  <a href={`/print/platform-bill/${b.id}`} target="_blank" rel="noopener" className="text-xs font-semibold text-brand-text">View</a></span>
              </li>
            ))}
            {!ours.bills.length && <li className="py-2 text-muted">No bills yet.</li>}
          </ul>
        </section>
      )}
    </div>
  );
}

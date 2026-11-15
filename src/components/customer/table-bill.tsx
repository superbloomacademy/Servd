'use client';
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Smartphone, Banknote, Clock } from 'lucide-react';
import { api, clock, rupee, useRealtime } from '@/lib/client';
import { Btn, Sheet, Spinner, VegMark, inputCls } from '@/components/ui/kit';
import { useToast } from '@/components/ui/providers';
import { upiLink } from './upi';
import type { Venue } from './types';

type Bill = {
  session: { id: string; status: 'open' | 'bill_requested' | 'closed'; payStatus: 'unpaid' | 'claimed' | 'paid'; payMethod: 'upi_shop' | 'cash' | null; billNo: number | null };
  spotLabel: string; subtotalPaise: number; discountPaise: number; taxPaise: number; totalPaise: number;
  rounds: { id: string; kotNo: number; status: string; createdAt: string; totalPaise: number; items: { name: string; qty: number; pricePaise: number; veg: boolean }[] }[];
};

// Running table bill: every round, request bill, pay to the venue's UPI or cash, wait for the cashier.
export function TableBillSheet({ open, onClose, tableSessionId, venue }: { open: boolean; onClose: () => void; tableSessionId: string; venue: Venue }) {
  const toast = useToast();
  const [bill, setBill] = useState<Bill | null>(null);
  const [utr, setUtr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setBill(await api(`/api/tables/${tableSessionId}`)); } catch (e) { toast((e as Error).message, 'bad'); } }, [tableSessionId, toast]);
  useEffect(() => { if (open) load(); }, [open, load]);
  useRealtime(open ? [`table:${tableSessionId}`] : [], { table: () => load() });

  const act = async (fn: () => Promise<Bill>) => { setBusy(true); try { setBill(await fn()); } catch (e) { toast((e as Error).message, 'bad'); } finally { setBusy(false); } };
  const s = bill?.session;

  return (
    <Sheet open={open} onClose={onClose} title={`Table bill${bill ? ` · ${bill.spotLabel}` : ''}`}
      footer={bill && s && s.status !== 'closed' && bill.rounds.length > 0 ? (
        s.status === 'open' ? (
          <div className="grid grid-cols-2 gap-2">
            <Btn tone="brand" size="lg" loading={busy} onClick={() => act(() => api(`/api/tables/${tableSessionId}/request-bill`, { body: { payMethod: 'upi_shop' } }))}><Smartphone size={17} />Pay by UPI</Btn>
            {venue.acceptCash && <Btn tone="outline" size="lg" loading={busy} onClick={() => act(() => api(`/api/tables/${tableSessionId}/request-bill`, { body: { payMethod: 'cash' } }))}><Banknote size={17} />Pay cash</Btn>}
          </div>
        ) : s.payMethod === 'upi_shop' && s.payStatus !== 'claimed' && venue.upiId ? (
          <div className="space-y-3">
            <a href={upiLink(venue.upiId, venue.upiName || venue.name, bill.totalPaise, `Table bill ${bill.spotLabel}`)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3.5 font-bold text-brand-ink"><Smartphone size={18} />Pay {rupee(bill.totalPaise)} with UPI app</a>
            <div className="flex gap-2">
              <input value={utr} onChange={e => setUtr(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={12} placeholder="UPI ref no. (optional)" aria-label="UPI reference number" className={inputCls} />
              <Btn tone="dark" loading={busy} onClick={() => act(() => api(`/api/tables/${tableSessionId}/paid`, { body: { utr } }))}>I’ve paid</Btn>
            </div>
          </div>
        ) : null
      ) : undefined}>
      {!bill ? <div className="grid place-items-center py-16"><Spinner className="text-muted" /></div> : (
        <div className="p-4">
          {s?.status === 'closed' && <Status icon={<CheckCircle2 size={20} />} tone="good" title={`Bill paid${s.billNo ? ` · Bill no. ${s.billNo}` : ''}`} text="Thank you! Scan the QR again to start a new order." />}
          {s?.status === 'closed' && <a href={`/print/invoice/${s.id}`} target="_blank" rel="noopener" className="block rounded-xl bg-soft px-3 py-2.5 text-center text-sm font-semibold">View GST bill</a>}
          {s?.status === 'bill_requested' && s.payMethod === 'cash' && <Status icon={<Clock size={20} />} title="Bill requested" text={`Please pay ${rupee(bill.totalPaise)} in cash. A staff member is coming to your table.`} />}
          {s?.status === 'bill_requested' && s.payMethod === 'upi_shop' && s.payStatus === 'claimed' && <Status icon={<Spinner size={18} />} title="Waiting for the cashier" text="The cashier will confirm your UPI payment and close the table." />}
          {s?.status === 'bill_requested' && s.payMethod === 'upi_shop' && s.payStatus !== 'claimed' && <Status icon={<Smartphone size={20} />} title={`Pay ${rupee(bill.totalPaise)} to ${venue.upiName || venue.name}`} text="Tap the button below, pay in your UPI app, then tap “I’ve paid”." />}
          {bill.rounds.length === 0 && <p className="py-8 text-center text-sm text-muted">Nothing ordered on this table yet.</p>}
          {bill.rounds.map((r, i) => (
            <div key={r.id} className="border-b border-dashed border-line py-3 last:border-0">
              <p className="flex justify-between text-xs font-semibold text-muted"><span>Round {i + 1} · KOT {r.kotNo}</span><span>{clock(r.createdAt)}</span></p>
              {r.items.map((it, k) => (
                <div key={k} className="mt-1.5 flex items-center gap-2 text-sm"><VegMark veg={it.veg} size={12} /><span className="flex-1">{it.qty} × {it.name}</span><span className="tabular">{rupee(it.qty * it.pricePaise)}</span></div>
              ))}
            </div>
          ))}
          {bill.rounds.length > 0 && (
            <div className="tabular mt-3 space-y-1.5 rounded-xl bg-soft p-3.5 text-sm">
              <div className="flex justify-between text-ink-2"><span>Item total</span><span>{rupee(bill.subtotalPaise)}</span></div>
              {bill.discountPaise > 0 && <div className="flex justify-between text-good"><span>Discounts</span><span>−{rupee(bill.discountPaise)}</span></div>}
              <div className="flex justify-between text-ink-2"><span>GST</span><span>{rupee(bill.taxPaise)}</span></div>
              <div className="flex justify-between border-t border-dashed border-line pt-2 text-base font-extrabold"><span>Total</span><span>{rupee(bill.totalPaise)}</span></div>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Status({ icon, title, text, tone }: { icon: React.ReactNode; title: string; text: string; tone?: 'good' }) {
  return (
    <div className={`mb-3 flex gap-3 rounded-xl p-3.5 text-sm ${tone === 'good' ? 'bg-[#E7F6EF] text-[#11734E]' : 'bg-brand-soft text-ink'}`}>
      <span className={tone === 'good' ? '' : 'text-brand-text'}>{icon}</span><div><b>{title}</b><p className="opacity-80">{text}</p></div>
    </div>
  );
}

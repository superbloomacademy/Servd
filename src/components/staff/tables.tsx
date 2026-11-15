'use client';
import { useCallback, useEffect, useState } from 'react';
import { BellRing, GlassWater, ReceiptText, Printer } from 'lucide-react';
import { api, clock, rupee, timeAgo } from '@/lib/client';
import { Btn, Pill, Sheet, VegMark } from '@/components/ui/kit';
import { useConfirm, useToast } from '@/components/ui/providers';
import { PageHead } from './shell';
import type { Live, TableBill, VenueCtx } from './types';

type Spot = { id: string; label: string; kind: string; areaId: string | null; active: boolean };
type Area = { id: string; name: string };

// Captain / cashier floor view: every table, its running bill, waiter calls, close the bill.
export function Tables({ venue, live, reload }: { venue: VenueCtx; live: Live; reload: () => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [spots, setSpots] = useState<Spot[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const running = venue.serviceMode === 'table_bill';

  const load = useCallback(async () => {
    const r = await api<{ areas: Area[]; spots: Spot[] }>(`/api/staff/v/${venue.id}/spots`);
    setAreas(r.areas); setSpots(r.spots.filter(s => s.kind === 'table' && s.active));
  }, [venue.id]);
  useEffect(() => { load(); }, [load]);

  const billFor = (spotId: string) => live.tables.find(t => t.session.spotId === spotId);
  const reqFor = (spotId: string) => live.requests.filter(r => r.spotId === spotId);
  const activeOrdersFor = (spotId: string) => live.orders.filter(o => o.spotLabel === `Table ${spots.find(s => s.id === spotId)?.label}` && ['awaiting_payment', 'confirmed', 'preparing', 'ready'].includes(o.status));
  const bill = open ? billFor(open) : undefined;
  const spot = spots.find(s => s.id === open);

  const done = async (id: string) => { try { await api(`/api/staff/requests/${id}`, { body: {} }); reload(); } catch (e) { toast((e as Error).message, 'bad'); } };
  const close = async (b: TableBill, method: 'upi_shop' | 'cash') => {
    const ok = await confirm({
      title: `Close ${b.spotLabel}?`,
      body: method === 'cash' ? <>Confirm you received <b>{rupee(b.totalPaise)}</b> in cash. The bill is closed and the table becomes free.</>
        : <>Confirm <b>{rupee(b.totalPaise)}</b> reached your account by UPI{b.session.utrLast4 ? <> (ref ends <b>{b.session.utrLast4}</b>)</> : null}. Check the soundbox or bank app, not a screenshot.</>,
      confirm: method === 'cash' ? 'Cash received, close' : 'UPI received, close', tone: 'primary',
    });
    if (!ok) return;
    try { await api(`/api/staff/tables/${b.session.id}`, { body: { method } }); toast(`${b.spotLabel} closed`); setOpen(null); reload(); }
    catch (e) { toast((e as Error).message, 'bad'); }
  };

  return (
    <div>
      <PageHead title="Tables" sub={running ? 'Each table runs one bill. Guests order in rounds and pay at the end. Close the table once the payment is confirmed.' : 'Live view of every table. Guests pay before each order.'} />

      {live.requests.length > 0 && (
        <div className="mb-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {live.requests.map(r => (
            <div key={r.id} className="anim-pop flex items-center gap-3 rounded-2xl border border-brand-line bg-brand-soft px-4 py-3">
              {r.kind === 'water' ? <GlassWater size={20} className="text-brand-text" /> : r.kind === 'bill' ? <ReceiptText size={20} className="text-brand-text" /> : <BellRing size={20} className="text-brand-text" />}
              <div className="min-w-0 flex-1 text-sm"><b>{r.spotLabel}</b> · {r.kind === 'water' ? 'asks for water' : r.kind === 'bill' ? 'asked for the bill' : 'is calling a waiter'}<p className="text-xs text-muted">{timeAgo(r.createdAt)}</p></div>
              <Btn size="sm" tone="outline" onClick={() => done(r.id)}>Done</Btn>
            </div>
          ))}
        </div>
      )}

      {areas.map(a => {
        const list = spots.filter(s => s.areaId === a.id);
        if (!list.length) return null;
        return (
          <section key={a.id} className="mb-6">
            <h2 className="mb-2 font-bold">{a.name}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
              {list.map(s => {
                const b = billFor(s.id), reqs = reqFor(s.id), act = activeOrdersFor(s.id);
                const state = b?.session.status === 'bill_requested' ? (b.session.payStatus === 'claimed' ? 'paid?' : 'bill') : b && b.rounds.length ? 'eating' : act.length ? 'eating' : b ? 'seated' : 'free';
                const style = { free: 'border-line bg-white', seated: 'border-[#BFD3F7] bg-[#F3F7FF]', eating: 'border-[#F5D7A9] bg-[#FFF8EC]', bill: 'border-brand bg-brand-soft', 'paid?': 'border-good bg-[#E7F6EF]' }[state];
                return (
                  <button key={s.id} onClick={() => b && setOpen(s.id)} disabled={!b}
                    className={`relative flex min-h-[112px] flex-col rounded-2xl border-2 p-3 text-left transition enabled:hover:shadow-sm ${style}`}>
                    {reqs.length > 0 && <span className="anim-ring absolute top-2.5 right-2.5 h-3 w-3 rounded-full bg-brand" />}
                    <span className="text-xl font-extrabold">{s.label}</span>
                    <span className="mt-auto text-xs font-semibold text-ink-2">
                      {state === 'free' ? 'Free' : state === 'seated' ? 'Seated · browsing' : state === 'bill' ? `Bill requested · ${b?.session.payMethod === 'cash' ? 'cash' : 'UPI'}` : state === 'paid?' ? 'Says paid, confirm' : running ? `${b?.rounds.length || 0} round${b?.rounds.length === 1 ? '' : 's'}` : `${act.length} active order${act.length === 1 ? '' : 's'}`}
                    </span>
                    {b && b.totalPaise > 0 && <span className="tabular text-sm font-bold">{rupee(b.totalPaise)}</span>}
                    {b && <span className="text-[11px] text-muted">since {clock(b.session.openedAt)}</span>}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      <Sheet open={!!bill} onClose={() => setOpen(null)} title={bill ? `${bill.spotLabel} · bill` : ''}
        footer={bill && running && bill.rounds.length > 0 ? (
          <div className="space-y-2">
            {bill.session.payStatus === 'claimed' && <p className="rounded-xl bg-[#E7F6EF] px-3 py-2 text-sm text-[#11734E]">Guest says they paid {rupee(bill.totalPaise)} by UPI{bill.session.utrLast4 ? ` · ref ends ${bill.session.utrLast4}` : ''}. Check, then close.</p>}
            <div className="grid grid-cols-2 gap-2">
              <Btn tone="good" size="lg" onClick={() => close(bill, 'upi_shop')}>UPI received</Btn>
              <Btn tone="outline" size="lg" onClick={() => close(bill, 'cash')}>Cash received</Btn>
            </div>
            <a href={`/print/table/${bill.session.id}`} target="_blank" rel="noopener" className="flex items-center justify-center gap-2 py-1.5 text-sm font-semibold text-muted"><Printer size={15} />Print bill</a>
          </div>
        ) : undefined}>
        {bill && (
          <div className="p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              <Pill tone={bill.session.status === 'bill_requested' ? 'brand' : 'neutral'}>{bill.session.status === 'bill_requested' ? 'Bill requested' : 'Ordering'}</Pill>
              <Pill>Open since {clock(bill.session.openedAt)}</Pill>
            </div>
            {bill.rounds.map((r, i) => (
              <div key={r.id} className="border-b border-dashed border-line py-3 last:border-0">
                <p className="flex justify-between text-xs font-semibold text-muted"><span>Round {i + 1} · KOT {r.kotNo} · {r.status}</span><span>{clock(r.createdAt)}</span></p>
                {r.items.map((it, k) => <div key={k} className="mt-1.5 flex items-center gap-2 text-sm"><VegMark veg={it.veg} size={12} /><span className="flex-1">{it.qty} × {it.name}</span><span className="tabular">{rupee(it.qty * it.pricePaise)}</span></div>)}
              </div>
            ))}
            {!bill.rounds.length && <p className="py-6 text-center text-sm text-muted">Guests have scanned the QR but not ordered yet.</p>}
            {bill.rounds.length > 0 && <div className="tabular mt-3 flex justify-between rounded-xl bg-soft p-3 font-extrabold"><span>Total (incl. GST)</span><span>{rupee(bill.totalPaise)}</span></div>}
          </div>
        )}
      </Sheet>
    </div>
  );
}

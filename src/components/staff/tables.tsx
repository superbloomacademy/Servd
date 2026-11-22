'use client';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRightLeft, BellRing, GlassWater, Merge, Percent, Plus, Printer, ReceiptText, Users, X } from 'lucide-react';
import { api, clock, minsSince, rupee, timeAgo } from '@/lib/client';
import { Btn, Pill, Sheet, VegMark } from '@/components/ui/kit';
import { useConfirm, useToast } from '@/components/ui/providers';
import { PageHead } from './shell';
import { PaySheet } from './pay-sheet';
import { CancelItemSheet, DiscountSheet, Stepper } from './pos-parts';
import { useOrderActions } from './order-parts';
import { CHANNEL_LABEL, needsAccept, type Live, type Role, type TableBill, type VenueCtx } from './types';

export type Spot = { id: string; label: string; kind: string; areaId: string | null; active: boolean };
type Area = { id: string; name: string };

export function useTables(venueId: string) {
  const [spots, setSpots] = useState<Spot[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    const r = await api<{ areas: Area[]; spots: Spot[] }>(`/api/staff/v/${venueId}/spots`);
    setAreas(r.areas); setSpots(r.spots.filter(s => s.kind === 'table' && s.active)); setLoaded(true);
  }, [venueId]);
  useEffect(() => { load(); }, [load]);
  return { spots, areas, loaded };
}

// Floor view: every table with its state. Free table → start an order. Running table → its bill.
export function Tables({ venue, live, role, reload, onOrder }: { venue: VenueCtx; live: Live; role: Role; reload: () => void; onOrder: (spotId: string) => void }) {
  const toast = useToast();
  const { spots, areas } = useTables(venue.id);
  const [open, setOpen] = useState<string | null>(null);

  const billFor = (spotId: string) => live.tables.find(t => t.session.spotId === spotId);
  const reqFor = (spotId: string) => live.requests.filter(r => r.spotId === spotId);
  const bill = open ? live.tables.find(t => t.session.id === open) : undefined;
  const done = async (id: string) => { try { await api(`/api/staff/requests/${id}`, { body: {} }); reload(); } catch (e) { toast((e as Error).message, 'bad'); } };

  const running = live.tables.filter(t => t.rounds.length);
  const sales = running.reduce((a, t) => a + t.duePaise, 0);
  const groups = [...areas.map(a => ({ id: a.id, name: a.name, list: spots.filter(s => s.areaId === a.id) })), { id: 'none', name: 'Tables', list: spots.filter(s => !s.areaId) }].filter(g => g.list.length);

  return (
    <div>
      <PageHead title="Tables" sub="Tap a free table to take an order. Tap a running table to see its bill, add items, give a discount, move or merge, and settle."
        right={<div className="flex gap-2 text-sm">
          <Pill tone="neutral">{spots.length - live.tables.length} free</Pill>
          <Pill tone="warn">{live.tables.length} occupied</Pill>
          {sales > 0 && <Pill tone="info">Running {rupee(sales)}</Pill>}
        </div>} />

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

      <div className="mb-4 flex flex-wrap gap-3 text-xs text-muted">
        <Legend cls="border-line bg-white" label="Free" /><Legend cls="border-[#BFD3F7] bg-[#F3F7FF]" label="Seated" />
        <Legend cls="border-bad bg-[#FDECEE]" label="Accept first order" /><Legend cls="border-[#F5D7A9] bg-[#FFF8EC]" label="Running" /><Legend cls="border-brand bg-brand-soft" label="Bill asked" /><Legend cls="border-good bg-[#E7F6EF]" label="Says paid" />
      </div>

      {groups.map(g => (
        <section key={g.id} className="mb-6">
          <h2 className="mb-2 font-bold">{g.name}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            {g.list.map(s => {
              const b = billFor(s.id), reqs = reqFor(s.id);
              const state = tableState(b);
              const style = TABLE_STYLE[state];
              const mins = b ? minsSince(b.session.openedAt) : 0;
              return (
                <button key={s.id} onClick={() => (b ? setOpen(b.session.id) : onOrder(s.id))}
                  className={`relative flex min-h-[116px] flex-col rounded-2xl border-2 p-3 text-left transition hover:shadow-sm ${style}`}>
                  {reqs.length > 0 && <span className="anim-ring absolute top-2.5 right-2.5 h-3 w-3 rounded-full bg-brand" />}
                  <span className="flex items-baseline justify-between gap-2"><span className="text-xl font-extrabold">{s.label}</span>
                    {b && b.session.guests > 0 && <span className="flex items-center gap-1 text-xs font-semibold text-ink-2"><Users size={12} />{b.session.guests}</span>}</span>
                  {state === 'free' ? <span className="mt-auto flex items-center gap-1 text-xs font-semibold text-muted"><Plus size={13} />New order</span> : (
                    <>
                      <span className="mt-auto text-xs font-semibold text-ink-2">
                        {state === 'accept' ? 'First QR order · accept' : state === 'seated' ? 'Seated · no order yet' : state === 'bill' ? 'Bill requested' : state === 'paid?' ? 'Says paid, confirm' : `${b!.rounds.length} KOT${b!.rounds.length === 1 ? '' : 's'}`}
                      </span>
                      {b!.duePaise > 0 && <span className="tabular text-base font-extrabold">{rupee(b!.duePaise)}</span>}
                      <span className={`text-[11px] ${mins >= 90 ? 'font-semibold text-bad' : 'text-muted'}`}>{dur(mins)} · since {clock(b!.session.openedAt)}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {!spots.length && <p className="rounded-2xl bg-white p-6 text-sm text-muted">No tables yet. Add them in QR codes.</p>}

      <TableBillSheet bill={bill ?? null} live={live} spots={spots} role={role} onClose={() => setOpen(null)} reload={reload}
        onAddItems={sid => { setOpen(null); onOrder(sid); }} />
    </div>
  );
}

export const TABLE_STYLE = { free: 'border-line bg-white', seated: 'border-[#BFD3F7] bg-[#F3F7FF]', accept: 'border-bad bg-[#FDECEE]', eating: 'border-[#F5D7A9] bg-[#FFF8EC]', bill: 'border-brand bg-brand-soft', 'paid?': 'border-good bg-[#E7F6EF]' };
export function tableState(b: TableBill | undefined): keyof typeof TABLE_STYLE {
  return !b ? 'free' : b.rounds.some(r => r.awaitingStaff) ? 'accept' : b.session.status === 'bill_requested' ? (b.session.payStatus === 'claimed' ? 'paid?' : 'bill') : b.rounds.length ? 'eating' : 'seated';
}
/** 45 → "45 min", 742 → "12 h 22 min". */
export const dur = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);

function Legend({ cls, label }: { cls: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className={`h-3.5 w-3.5 rounded border-2 ${cls}`} />{label}</span>;
}

const SETTLE: Role[] = ['owner', 'manager', 'cashier', 'captain'];
const DISCOUNT: Role[] = ['owner', 'manager', 'cashier'];

// One table's running bill with every action the floor needs.
export function TableBillSheet({ bill, live, spots, role, onClose, reload, onAddItems }: {
  bill: TableBill | null; live: Live; spots: Spot[]; role: Role; onClose: () => void; reload: () => void; onAddItems?: (spotId: string) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [pay, setPay] = useState(false);
  const [disc, setDisc] = useState(false);
  const [pick, setPick] = useState<'move' | 'merge' | null>(null);
  const [cancel, setCancel] = useState<{ id: string; name: string; qty: number; pricePaise: number } | null>(null);
  const actions = useOrderActions(reload);
  const can = SETTLE.includes(role);
  const canFix = DISCOUNT.includes(role);
  if (!bill) return null;
  const sid = bill.session.id;
  const act = async (b: Record<string, unknown>, ok: string) => {
    try { await api(`/api/staff/tables/${sid}`, { body: b }); toast(ok); reload(); return true; }
    catch (e) { toast((e as Error).message, 'bad'); return false; }
  };
  const anyDiscount = bill.rounds.find(r => r.discountReason && r.payStatus === 'on_bill');
  const unpaidRounds = bill.rounds.filter(r => r.payStatus === 'on_bill');
  const empty = !bill.rounds.length;
  const toAccept = live.orders.find(o => o.tableSessionId === sid && needsAccept(o));
  const free = spots.filter(s => s.id !== bill.session.spotId && !live.tables.some(t => t.session.spotId === s.id));
  const others = live.tables.filter(t => t.session.id !== sid);

  return (
    <>
      <Sheet open={!pay && !disc && !pick && !cancel} onClose={onClose} wide
        title={<span className="flex items-center gap-3">{bill.spotLabel}<Pill tone={bill.session.status === 'bill_requested' ? 'brand' : 'neutral'}>{bill.session.status === 'bill_requested' ? 'Bill requested' : 'Running'}</Pill></span>}
        footer={
          <div className="space-y-2">
            {toAccept && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#FDECEE] px-3 py-2.5 text-sm text-[#B42334]">
                <span className="min-w-40 flex-1"><b>First QR order.</b> The kitchen gets it after you accept.</span>
                <Btn size="sm" tone="good" onClick={() => actions.accept(toAccept)}>Accept</Btn>
                <Btn size="sm" tone="danger" onClick={() => actions.reject(toAccept)}>Decline</Btn>
              </div>
            )}
            {bill.session.payStatus === 'claimed' && <p className="rounded-xl bg-[#E7F6EF] px-3 py-2 text-sm text-[#11734E]">Guest says they paid by UPI{bill.session.utrLast4 ? ` · ref ends ${bill.session.utrLast4}` : ''}. Check the soundbox or bank app, then settle.</p>}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {onAddItems && <Btn tone="outline" onClick={() => onAddItems(bill.session.spotId)}><Plus size={16} />Add items</Btn>}
              {canFix && unpaidRounds.length > 0 && <Btn tone="outline" onClick={() => setDisc(true)}><Percent size={16} />Discount</Btn>}
              <Btn tone="outline" onClick={() => setPick('move')}><ArrowRightLeft size={16} />Move</Btn>
              <Btn tone="outline" onClick={() => setPick('merge')} disabled={!others.length}><Merge size={16} />Merge</Btn>
            </div>
            <div className="flex gap-2">
              {!empty && <a href={`/print/table/${sid}`} target="_blank" rel="noopener" className="inline-flex items-center justify-center gap-2 rounded-xl border border-line px-4 py-3.5 font-semibold text-ink hover:bg-soft"><Printer size={16} />Print bill</a>}
              {empty ? <Btn tone="danger" size="lg" className="flex-1" onClick={async () => {
                if (await confirm({ title: `Free ${bill.spotLabel}?`, body: 'Nothing was ordered on this table. It becomes free for the next guests.', confirm: 'Free table', tone: 'primary' })) {
                  if (await act({ action: 'free' }, `${bill.spotLabel} is free`)) onClose();
                }
              }}>Free this table</Btn>
                : can ? <Btn tone="good" size="lg" className="flex-1" onClick={() => setPay(true)}>{bill.duePaise ? `Settle ${rupee(bill.duePaise)}` : 'Close table'}</Btn>
                  : <p className="flex-1 self-center text-center text-sm text-muted">The cashier settles the bill.</p>}
            </div>
          </div>
        }>
        <div className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="flex items-center gap-2 rounded-xl bg-soft px-3 py-1.5"><Users size={15} />Guests <Stepper value={bill.session.guests} label="guests" onChange={n => act({ action: 'guests', guests: n }, 'Guests updated')} /></span>
            <Pill>Open since {clock(bill.session.openedAt)} · {dur(minsSince(bill.session.openedAt))}</Pill>
          </div>
          {bill.rounds.map((r, i) => (
            <div key={r.id} className="border-b border-dashed border-line py-3 last:border-0">
              <p className="flex justify-between text-xs font-semibold text-muted">
                <span>Round {i + 1} · KOT {r.kotNo} · {r.status}{r.channel !== 'qr' ? ` · ${CHANNEL_LABEL[r.channel]}` : ' · by guest (QR)'}{r.payStatus === 'paid' ? ' · paid' : ''}</span><span>{clock(r.createdAt)}</span>
              </p>
              {r.items.map(it => (
                <div key={it.id} className="group mt-1.5 flex items-start gap-2 text-sm">
                  <span className="mt-1"><VegMark veg={it.veg} size={12} /></span>
                  <span className="flex-1">{it.qty} × {it.name}{it.note && <span className="block text-xs text-[#7A4A00]">“{it.note}”</span>}</span>
                  <span className="tabular">{rupee(it.qty * it.pricePaise)}</span>
                  {canFix && r.payStatus === 'on_bill' && !['cancelled', 'rejected'].includes(r.status) && (
                    <button onClick={() => setCancel({ id: it.id, name: it.name, qty: it.qty, pricePaise: it.pricePaise })} className="rounded-md p-1 text-muted hover:bg-[#FDECEE] hover:text-bad" aria-label={`Cancel ${it.name}`}><X size={15} /></button>
                  )}
                </div>
              ))}
            </div>
          ))}
          {empty && <p className="py-6 text-center text-sm text-muted">No orders on this table yet.</p>}
          {!empty && (
            <div className="tabular mt-3 space-y-1 rounded-xl bg-soft p-3 text-sm">
              <div className="flex justify-between"><span>Items</span><span>{rupee(bill.subtotalPaise)}</span></div>
              {bill.discountPaise > 0 && <div className="flex justify-between text-good"><span>Discount{anyDiscount?.discountReason ? ` · ${anyDiscount.discountReason}` : ''}</span><span>−{rupee(bill.discountPaise)}</span></div>}
              <div className="flex justify-between"><span>GST</span><span>{rupee(bill.taxPaise)}</span></div>
              {bill.roundOffPaise !== 0 && <div className="flex justify-between"><span>Round off</span><span>{bill.roundOffPaise > 0 ? '+' : '−'}{rupee(Math.abs(bill.roundOffPaise))}</span></div>}
              <div className="flex justify-between border-t border-line pt-1.5 text-base font-extrabold"><span>Total</span><span>{rupee(bill.totalPaise)}</span></div>
              {bill.duePaise !== bill.totalPaise && <div className="flex justify-between font-semibold text-brand-text"><span>Still to pay</span><span>{rupee(bill.duePaise)}</span></div>}
            </div>
          )}
        </div>
      </Sheet>

      <PaySheet venueId={live.venueId} open={pay} onClose={() => setPay(false)} title={`Settle ${bill.spotLabel}`} amountPaise={bill.duePaise} guests={bill.session.guests}
        onPay={async p => { if (await act({ action: 'close', payments: p }, `${bill.spotLabel} settled and free`)) { setPay(false); onClose(); } }} />
      <DiscountSheet open={disc} onClose={() => setDisc(false)} subtotalPaise={unpaidRounds.reduce((a, r) => a + r.items.reduce((x, i) => x + i.qty * i.pricePaise, 0), 0)}
        current={null} onApply={d => act({ action: 'discount', discount: d ?? { kind: 'flat', value: 0, reason: 'removed' } }, d ? 'Discount applied' : 'Discount removed')} />
      <CancelItemSheet item={cancel} onClose={() => setCancel(null)}
        onCancel={async (id, qty, reason) => { try { await api(`/api/staff/order-items/${id}`, { body: { qty, reason } }); toast('Item cancelled'); reload(); } catch (e) { toast((e as Error).message, 'bad'); throw e; } }} />
      <Sheet open={!!pick} onClose={() => setPick(null)} title={pick === 'move' ? `Move ${bill.spotLabel} to…` : `Merge ${bill.spotLabel} into…`}>
        <div className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-4">
          {(pick === 'move' ? free.map(s => ({ id: s.id, label: s.label, sub: 'Free' })) : others.map(t => ({ id: t.session.id, label: t.spotLabel.replace(/^Table /, ''), sub: rupee(t.duePaise) }))).map(x => (
            <button key={x.id} onClick={async () => {
              const ok = await confirm({
                title: pick === 'move' ? `Move to table ${x.label}?` : `Merge into table ${x.label}?`,
                body: pick === 'move' ? 'The bill, the guests and any open orders move to the new table. The kitchen sees the new table number.' : 'Both bills become one bill on the other table. This can’t be undone.',
                confirm: pick === 'move' ? 'Move' : 'Merge', tone: 'primary',
              });
              if (!ok) return;
              if (await act(pick === 'move' ? { action: 'move', spotId: x.id } : { action: 'merge', intoId: x.id }, pick === 'move' ? `Moved to table ${x.label}` : `Merged into table ${x.label}`)) { setPick(null); onClose(); }
            }} className="rounded-xl border-2 border-line p-3 text-left hover:border-ink">
              <span className="block text-lg font-extrabold">{x.label}</span><span className="text-xs text-muted">{x.sub}</span>
            </button>
          ))}
          {(pick === 'move' ? !free.length : !others.length) && <p className="col-span-full py-4 text-center text-sm text-muted">{pick === 'move' ? 'No free tables right now.' : 'No other running tables.'}</p>}
        </div>
      </Sheet>
    </>
  );
}

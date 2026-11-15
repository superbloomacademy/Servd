'use client';
import { Banknote, Clock, Printer, Smartphone, StickyNote, Clapperboard, ReceiptText } from 'lucide-react';
import { api, clock, minsSince, rupee } from '@/lib/client';
import { Btn, Pill, VegMark } from '@/components/ui/kit';
import { useConfirm, useToast } from '@/components/ui/providers';
import type { Kot, Order } from './types';

// Every action that changes an order or money asks for confirmation first.
export function useOrderActions(onDone?: () => void) {
  const confirm = useConfirm();
  const toast = useToast();
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast(ok); onDone?.(); } catch (e) { toast((e as Error).message, 'bad'); }
  };
  return {
    confirmPayment: async (o: Order) => {
      const cash = o.payMethod === 'cash';
      const yes = await confirm({
        title: cash ? `Cash received for KOT ${o.kotNo}?` : `UPI payment received for KOT ${o.kotNo}?`,
        body: cash ? <>Confirm you have received <b>{rupee(o.totalPaise)}</b> in cash. The order goes to the kitchen right after.</>
          : <>Confirm <b>{rupee(o.totalPaise)}</b> reached your account{o.utrLast4 ? <> (customer’s UPI ref ends <b>{o.utrLast4}</b>)</> : null}. Check your <b>soundbox or bank app</b>. Never accept a screenshot as proof.</>,
        confirm: cash ? 'Cash received' : 'Payment received', tone: 'primary',
      });
      if (yes) await run(() => api(`/api/staff/orders/${o.id}`, { body: { action: 'confirm_payment' } }), `KOT ${o.kotNo} confirmed and sent to the kitchen`);
    },
    reject: async (o: Order) => {
      const r = await confirm({
        title: `Reject KOT ${o.kotNo}?`,
        body: o.payStatus === 'paid' ? <>The customer has already paid <b>{rupee(o.totalPaise)}</b>. Refund them at the counter. They’ll see the reason below.</> : 'The customer will see that the order was rejected, with your reason.',
        confirm: 'Reject order', tone: 'danger', input: { label: 'Reason the customer will see', placeholder: 'e.g. Seat is empty / Item finished', required: true },
      });
      if (r) await run(() => api(`/api/staff/orders/${o.id}`, { body: { action: 'reject', reason: r.value } }), `KOT ${o.kotNo} rejected`);
    },
    advance: async (o: Order, to: 'preparing' | 'ready' | 'out' | 'delivered') => {
      if (to === 'delivered' && o.fulfilment === 'pickup') {
        const yes = await confirm({ title: `Hand over KOT ${o.kotNo}?`, body: `Check the customer shows KOT ${o.kotNo} on their phone before you hand it over.`, confirm: 'Handed over', tone: 'primary' });
        if (!yes) return;
      }
      await run(() => api(`/api/staff/orders/${o.id}`, { body: { action: to } }),
        { preparing: 'Started', ready: `KOT ${o.kotNo} is ready`, out: `KOT ${o.kotNo} is on the way`, delivered: `KOT ${o.kotNo} delivered` }[to]);
    },
    kot: (k: Kot, status: 'preparing' | 'ready', kotNo: number) => run(() => api(`/api/staff/kots/${k.id}`, { body: { status } }), status === 'ready' ? `KOT ${kotNo} · ${k.stationName} ready` : `KOT ${kotNo} started`),
  };
}

export function PayChip({ o }: { o: Order }) {
  if (['cancelled', 'rejected'].includes(o.status) && o.payStatus !== 'paid') return null;
  if (o.payStatus === 'on_bill') return <Pill tone="info"><ReceiptText size={12} />On table bill</Pill>;
  if (o.payStatus === 'paid') return <Pill tone="good">{o.payMethod === 'cash' ? <Banknote size={12} /> : <Smartphone size={12} />}Paid · {o.payMethod === 'cash' ? 'Cash' : 'UPI'}</Pill>;
  if (o.payMethod === 'cash') return <Pill tone="warn"><Banknote size={12} />Cash due {rupee(o.totalPaise)}</Pill>;
  if (o.payStatus === 'claimed') return <Pill tone="warn" className="anim-pop"><Smartphone size={12} />Says paid{o.utrLast4 ? ` · ref ${o.utrLast4}` : ''}</Pill>;
  return <Pill tone="neutral"><Smartphone size={12} />UPI not paid yet</Pill>;
}

export function Age({ ts, warnAt = 12 }: { ts: string; warnAt?: number }) {
  const m = minsSince(ts);
  return <span className={`tabular inline-flex items-center gap-1 text-xs font-semibold ${m >= warnAt ? 'text-bad' : 'text-muted'}`}><Clock size={12} />{m < 1 ? 'now' : `${m} min`}</span>;
}

export function OrderCard({ o, flash, children, stationId }: { o: Order; flash?: boolean; children?: React.ReactNode; stationId?: string | null }) {
  const placed = o.timeline.find(t => t.status === 'confirmed')?.at || o.createdAt;
  const items = stationId ? o.items.filter(i => i.stationId === stationId) : o.items;
  return (
    <article className={`rounded-2xl border bg-white p-3.5 ${flash ? 'anim-pop border-brand shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand)_25%,transparent)]' : 'border-line'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="tabular text-[22px] leading-none font-extrabold">KOT {o.kotNo}</p>
          <p className="mt-1 text-sm font-semibold text-ink-2">{o.spotLabel}</p>
        </div>
        <div className="flex flex-col items-end gap-1"><Age ts={placed} /><span className="tabular text-xs text-muted">{clock(o.createdAt)}</span></div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <PayChip o={o} />
        {o.deliverAt === 'interval' && <Pill tone="brand"><Clapperboard size={12} />Interval{o.releaseAt ? ` · kitchen ${clock(o.releaseAt)}` : ''}</Pill>}
        {o.fulfilment === 'pickup' && <Pill>Counter pickup</Pill>}
        {o.couponCode && <Pill>{o.couponCode}</Pill>}
      </div>
      <ul className="mt-2.5 space-y-1 text-[14px]">
        {items.map(i => <li key={i.id} className="flex items-center gap-2"><VegMark veg={i.veg} size={11} /><b className="tabular w-6">{i.qty}×</b><span>{i.name}</span></li>)}
      </ul>
      {o.note && <p className="mt-2 flex gap-1.5 rounded-lg bg-[#FFF8EC] px-2.5 py-1.5 text-[13px] text-[#7A4A00]"><StickyNote size={14} className="mt-0.5 shrink-0" />{o.note}</p>}
      {o.kots.length > 1 && !stationId && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {o.kots.map(k => <Pill key={k.id} tone={k.status === 'ready' ? 'good' : k.status === 'preparing' ? 'warn' : 'neutral'}>{k.stationName}: {k.status === 'held' ? 'waiting' : k.status}</Pill>)}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {children}
        <a href={`/print/kot/${o.id}`} target="_blank" rel="noopener" className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted hover:bg-soft" aria-label="Print KOT"><Printer size={14} />KOT</a>
        {o.payStatus === 'paid' && <a href={`/print/invoice/${o.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted hover:bg-soft" aria-label="Print GST bill"><ReceiptText size={14} />Bill</a>}
      </div>
    </article>
  );
}

export function OrderButtons({ o, actions, can }: { o: Order; actions: ReturnType<typeof useOrderActions>; can: (a: 'pay' | 'cook' | 'deliver' | 'reject') => boolean }) {
  return (
    <>
      {o.status === 'awaiting_payment' && can('pay') && <Btn size="sm" tone="good" onClick={() => actions.confirmPayment(o)}>{o.payMethod === 'cash' ? 'Cash received' : 'Payment received'}</Btn>}
      {['confirmed', 'preparing'].includes(o.status) && can('cook') && <Btn size="sm" tone="dark" onClick={() => actions.advance(o, 'ready')}>Mark ready</Btn>}
      {o.status === 'ready' && o.fulfilment === 'seat' && can('deliver') && <Btn size="sm" tone="dark" onClick={() => actions.advance(o, 'out')}>Out for delivery</Btn>}
      {((o.status === 'ready' && o.fulfilment !== 'seat') || o.status === 'out') && can('deliver') && <Btn size="sm" tone="good" onClick={() => actions.advance(o, 'delivered')}>{o.fulfilment === 'pickup' ? 'Handed over' : 'Delivered'}</Btn>}
      {!['delivered', 'cancelled', 'rejected'].includes(o.status) && can('reject') && <Btn size="sm" tone="danger" onClick={() => actions.reject(o)}>Reject</Btn>}
    </>
  );
}

'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Banknote, CheckCircle2, Clock, HelpCircle, Phone, ReceiptText, Smartphone, XCircle } from 'lucide-react';
import { api, ApiFail, clock, rupee, useRealtime } from '@/lib/client';
import { brandVars } from '@/lib/theme';
import { Btn, Spinner, VegMark, inputCls } from '@/components/ui/kit';
import { useConfirm, useToast } from '@/components/ui/providers';
import { LoginSheet } from './login-sheet';
import { upiLink } from './upi';
import type { OrderView, Vendor, Venue } from './types';

type Data = { order: OrderView; venue: Venue; vendor: Vendor; menuCode: string | null; venuePhone: string | null; invoice: { id: string; number: string; status: string } | null };

export function OrderTracker({ id }: { id: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [needLogin, setNeedLogin] = useState(false);
  const [utr, setUtr] = useState('');
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    try { setD(await api<Data>(`/api/orders/${id}`)); setErr(''); }
    catch (e) { if ((e as ApiFail).status === 401) setNeedLogin(true); else setErr((e as Error).message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 15000); return () => clearInterval(t); }, []);
  useRealtime(d ? [`order:${id}`] : [], {
    order: (m: { order: OrderView }) => {
      setD(prev => {
        if (prev && prev.order.status !== m.order.status) { navigator.vibrate?.(150); }
        return prev ? { ...prev, order: m.order } : prev;
      });
      if (m.order.payStatus === 'paid') setTimeout(load, 600);   // the GST bill is ready now
    },
  });

  if (needLogin) return (
    <div className="mx-auto max-w-md p-6 pt-20 text-center">
      <p className="text-lg font-bold">Log in to see this order</p>
      <p className="mt-1 text-sm text-muted">Use the phone number you ordered with.</p>
      <LoginSheet open onClose={() => history.back()} onDone={() => { setNeedLogin(false); load(); }} />
    </div>
  );
  if (err) return <div className="mx-auto max-w-md p-6 pt-24 text-center"><p className="text-lg font-bold">{err}</p><Link href="/account" className="mt-4 inline-block font-semibold text-[#C81E2E]">See my orders</Link></div>;
  if (!d) return <div className="grid min-h-dvh place-items-center"><Spinner size={28} className="text-muted" /></div>;

  const { order: o, venue, vendor } = d;
  const at = (s: string) => o.timeline.find(t => t.status === s)?.at;
  const pickup = o.fulfilment === 'pickup';
  const waitingPay = o.status === 'awaiting_payment';
  const minsLeft = Math.max(0, venue.unpaidCancelMin - Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 60000));

  const steps: { key: string; label: string; done: boolean; time?: string }[] = [
    { key: 'placed', label: 'Order placed', done: true, time: o.createdAt },
    ...(o.payMethod !== 'bill' ? [{ key: 'paid', label: o.payMethod === 'cash' ? 'Cash received' : 'Payment confirmed', done: o.payStatus === 'paid', time: at('paid') }] : []),
    { key: 'preparing', label: 'Being prepared', done: ['preparing', 'ready', 'out', 'delivered'].includes(o.status), time: at('preparing') },
    { key: 'ready', label: pickup ? 'Ready at the counter' : 'Ready', done: ['ready', 'out', 'delivered'].includes(o.status), time: at('ready') },
    ...(o.fulfilment === 'seat' ? [{ key: 'out', label: 'On the way to your seat', done: ['out', 'delivered'].includes(o.status), time: at('out') }] : []),
    { key: 'delivered', label: pickup ? 'Collected' : 'Served', done: o.status === 'delivered', time: at('delivered') },
  ];
  const current = steps.findIndex(s => !s.done);

  const headline = o.status === 'rejected' ? 'Order rejected' : o.status === 'cancelled' ? 'Order cancelled'
    : waitingPay ? (o.payMethod === 'cash' ? 'Pay at the counter' : o.payStatus === 'claimed' ? 'Confirming your payment' : 'Complete your payment')
    : o.status === 'ready' && pickup ? 'Ready! Collect it now' : o.status === 'delivered' ? (pickup ? 'Collected. Enjoy!' : 'Served. Enjoy!')
    : o.status === 'out' ? 'On the way to your seat' : o.status === 'ready' ? 'Ready, coming to you' : o.deliverAt === 'interval' && o.releaseAt && new Date(o.releaseAt) > new Date() ? 'Scheduled for the interval' : 'Being prepared';

  const claim = async () => {
    setBusy(true);
    try { setD({ ...d, order: (await api<{ order: OrderView }>(`/api/orders/${id}/paid`, { body: { utr } })).order }); }
    catch (e) { toast((e as Error).message, 'bad'); } finally { setBusy(false); }
  };
  const cancel = async () => {
    const ok = await confirm({ title: `Cancel KOT ${o.kotNo}?`, body: 'Your order will not be sent to the kitchen. Do this only if you have not paid.', confirm: 'Cancel order', cancel: 'Keep order', tone: 'danger' });
    if (!ok) return;
    try { setD({ ...d, order: (await api<{ order: OrderView }>(`/api/orders/${id}/cancel`, { body: {} })).order }); }
    catch (e) { toast((e as Error).message, 'bad'); }
  };

  return (
    <div style={brandVars(vendor.brandColor)} className="mx-auto min-h-dvh max-w-[560px] bg-soft pb-16">
      <div className="bg-brand px-4 pt-3 pb-16 text-brand-ink">
        <div className="flex items-center justify-between">
          {d.menuCode ? <Link href={`/q/${d.menuCode}`} className="-ml-1 inline-flex items-center gap-1 rounded-full bg-white/15 py-1.5 pr-3 pl-2 text-sm font-semibold"><ArrowLeft size={18} />Back to menu</Link> : <span className="text-xs font-semibold opacity-80">Scan the QR to order again</span>}
          <Link href="/account" className="text-sm font-semibold opacity-90">My orders</Link>
        </div>
        <p className="mt-4 text-sm font-semibold opacity-85">{vendor.name} · {o.spotLabel}</p>
        <h1 className="mt-1 text-[26px] leading-tight font-extrabold">{headline}</h1>
      </div>

      <div className="-mt-12 px-3">
        {/* KOT card */}
        <section className="rounded-2xl bg-white p-5 text-center shadow-[0_6px_24px_rgba(0,0,0,0.08)]">
          <p className="text-xs font-bold tracking-[0.18em] text-muted uppercase">Your KOT number</p>
          <p className="tabular mt-1 text-6xl font-extrabold tracking-tight text-ink">{o.kotNo}</p>
          <p className="mt-2 text-sm text-muted">
            {pickup ? `Show this number at the counter${o.status === 'ready' ? ' now' : ' when it’s ready'}.` : o.fulfilment === 'seat' ? 'Show this number when your order arrives at your seat.' : 'Your order will be served at your table.'}
          </p>
          {o.status === 'rejected' && <p className="mt-3 rounded-xl bg-[#FDECEE] p-3 text-sm text-[#B42334]"><XCircle size={16} className="mr-1 inline" />{o.rejectReason || 'The venue could not accept this order.'}{o.payStatus === 'paid' ? ' Please collect your refund at the counter.' : ''}</p>}
          {o.status === 'cancelled' && <p className="mt-3 rounded-xl bg-soft p-3 text-sm text-ink-2">{o.rejectReason || 'This order was cancelled.'}</p>}
        </section>

        {/* Payment */}
        {waitingPay && o.payMethod === 'upi_shop' && (
          <section className="mt-3 rounded-2xl bg-white p-4">
            {o.payStatus === 'claimed' ? (
              <div className="flex gap-3">
                <Spinner size={20} className="mt-0.5 shrink-0 text-brand-text" />
                <div className="text-sm"><b className="block text-[15px]">Waiting for {venue.upiName || vendor.name} to confirm</b>
                  <span className="text-muted">They check that {rupee(o.totalPaise)} arrived{o.utrLast4 ? ` (ref. ending ${o.utrLast4})` : ''}. Your order goes to the kitchen right after. If it takes long, show this screen at the counter.</span></div>
              </div>
            ) : (
              <>
                <p className="text-sm text-ink-2">Pay <b className="tabular text-ink">{rupee(o.totalPaise)}</b> to <b className="text-ink">{venue.upiName || vendor.name}</b>{venue.upiId ? <> · <span className="font-mono text-xs">{venue.upiId}</span></> : null}</p>
                {venue.upiId && <a href={upiLink(venue.upiId, venue.upiName || vendor.name, o.totalPaise, `KOT ${o.kotNo}`)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3.5 text-[15px] font-bold text-brand-ink"><Smartphone size={18} />Pay {rupee(o.totalPaise)} with UPI app</a>}
                {venue.upiQrUrl && (
                  <details className="mt-3 rounded-xl border border-line p-3 text-sm"><summary className="cursor-pointer font-semibold">Or scan the shop’s UPI QR</summary>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={venue.upiQrUrl} alt="Venue UPI QR code" className="mx-auto mt-3 w-56 rounded-lg" /></details>
                )}
                <div className="mt-4 border-t border-dashed border-line pt-4">
                  <p className="text-sm font-semibold">Paid already?</p>
                  <div className="mt-2 flex gap-2">
                    <input value={utr} onChange={e => setUtr(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={12} placeholder="UPI ref no. (optional)" aria-label="UPI reference number" className={inputCls} />
                    <Btn tone="dark" loading={busy} onClick={claim}>I’ve paid</Btn>
                  </div>
                  <p className="mt-2 text-xs text-muted">Unpaid orders cancel automatically in {minsLeft} min. The venue confirms payments from their bank or soundbox, never from screenshots.</p>
                </div>
              </>
            )}
          </section>
        )}
        {waitingPay && o.payMethod === 'cash' && (
          <section className="mt-3 flex gap-3 rounded-2xl bg-white p-4 text-sm">
            <Banknote size={22} className="shrink-0 text-brand-text" />
            <div><b className="block text-[15px]">Pay {rupee(o.totalPaise)} in cash at the counter</b><span className="text-muted">Tell them KOT {o.kotNo}. Your order is prepared once they confirm. It cancels automatically in {minsLeft} min if unpaid.</span></div>
          </section>
        )}

        {/* Progress */}
        {!['rejected', 'cancelled'].includes(o.status) && (
          <section className="mt-3 rounded-2xl bg-white p-4">
            {o.deliverAt === 'interval' && o.releaseAt && <p className="mb-3 flex items-center gap-2 rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand-text"><Clock size={16} />Kitchen starts at {clock(o.releaseAt)} so it reaches you at the interval.</p>}
            <ol>
              {steps.map((s, i) => (
                <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
                  {i < steps.length - 1 && <span className={`absolute top-6 bottom-0 left-[11px] w-0.5 ${s.done ? 'bg-good' : 'bg-line'}`} />}
                  <span className={`relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${s.done ? 'border-good bg-good text-white' : i === current ? 'anim-ring border-brand bg-white' : 'border-line bg-white'}`}>
                    {s.done && <CheckCircle2 size={14} strokeWidth={3} />}
                  </span>
                  <div className="flex flex-1 justify-between gap-2 text-sm"><span className={s.done || i === current ? 'font-semibold text-ink' : 'text-muted'}>{s.label}</span>{s.time && <span className="tabular text-xs text-muted">{clock(s.time)}</span>}</div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Items & bill */}
        <section className="mt-3 rounded-2xl bg-white p-4 text-sm">
          <h2 className="mb-2 font-extrabold">Order details</h2>
          {o.items.map((it, k) => <div key={k} className="flex items-center gap-2 py-1"><VegMark veg={it.veg} size={12} /><span className="flex-1">{it.qty} × {it.name}</span><span className="tabular">{rupee(it.qty * it.pricePaise)}</span></div>)}
          {o.note && <p className="mt-2 rounded-lg bg-soft px-3 py-2 text-xs text-ink-2">Note: {o.note}</p>}
          <div className="tabular mt-3 space-y-1 border-t border-dashed border-line pt-3 text-ink-2">
            <div className="flex justify-between"><span>Item total</span><span>{rupee(o.subtotalPaise)}</span></div>
            {o.discountPaise > 0 && <div className="flex justify-between text-good"><span>{o.couponCode}</span><span>−{rupee(o.discountPaise)}</span></div>}
            <div className="flex justify-between"><span>GST</span><span>{rupee(o.taxPaise)}</span></div>
            <div className="flex justify-between pt-1 text-[15px] font-extrabold text-ink"><span>{o.payMethod === 'bill' ? 'Added to table bill' : o.payStatus === 'paid' ? `Paid · ${o.payMethod === 'cash' ? 'Cash' : 'UPI'}` : 'To pay'}</span><span>{rupee(o.totalPaise)}</span></div>
          </div>
          {o.showLabel && <p className="mt-3 text-xs text-muted">{o.showLabel}</p>}
          {d.invoice && (
            <a href={`/print/invoice/${d.invoice.id}`} target="_blank" rel="noopener" className="mt-3 flex items-center justify-between rounded-xl bg-soft px-3 py-2.5 font-semibold">
              <span className="flex items-center gap-2"><ReceiptText size={16} />{d.invoice.status === 'cancelled' ? 'Bill (cancelled)' : 'View GST bill'}</span><span className="text-xs font-normal text-muted">{d.invoice.number}</span>
            </a>
          )}
        </section>

        {d.menuCode && !waitingPay && (
          <Link href={`/q/${d.menuCode}`} className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-brand py-3.5 text-[15px] font-bold text-brand-ink">Order more from {vendor.name}</Link>
        )}
        <div className="mt-3 flex gap-2">
          <Link href={`/account?tab=help&order=${o.id}`} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-white py-3 text-sm font-semibold"><HelpCircle size={17} />Need help?</Link>
          {d.venuePhone && <a href={`tel:${d.venuePhone}`} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-white py-3 text-sm font-semibold"><Phone size={17} />Call venue</a>}
          {waitingPay && o.payStatus === 'unpaid' && <button onClick={cancel} className="flex-1 rounded-xl border border-line bg-white py-3 text-sm font-semibold text-bad">Cancel order</button>}
        </div>
        <p className="mt-4 text-center text-xs text-muted">You can close this page. Your order is saved to your number.</p>
      </div>
    </div>
  );
}

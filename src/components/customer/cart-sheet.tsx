'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BadgePercent, Banknote, Check, ChevronDown, Clapperboard, NotebookPen, Smartphone, Zap, ReceiptText } from 'lucide-react';
import { api, ApiFail, rupee } from '@/lib/client';
import { Btn, Spinner, VegMark } from '@/components/ui/kit';
import { useToast } from '@/components/ui/providers';
import { AddButton, MiniCard } from './item-parts';
import { hasOpts, lineInfo, parseKey, type Item, type OrderView, type Quote, type ScanData } from './types';

export function CartSheet({ open, onClose, data, cart, setQty, catName, onNeedLogin, onPlaced, onRescan }: {
  open: boolean; onClose: () => void; data: ScanData; cart: Record<string, number>; setQty: (id: string, q: number) => void;
  catName: Record<string, string>; onNeedLogin: (then: () => void) => void; onPlaced: (o: OrderView) => void; onRescan: () => void;
}) {
  const toast = useToast();
  const { venue, window: win } = data;
  const running = venue.serviceMode === 'table_bill';
  const theater = venue.serviceMode === 'seat_delivery';
  const [quote, setQuote] = useState<Quote | null>(null);
  const [coupon, setCoupon] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [codeErr, setCodeErr] = useState('');
  const [allCoupons, setAllCoupons] = useState(false);
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [deliverAt, setDeliverAt] = useState<'now' | 'interval'>('now');
  const [payMethod, setPayMethod] = useState<'upi_shop' | 'cash'>('upi_shop');
  const [placing, setPlacing] = useState(false);

  type L = { key: string; item: Item; qty: number; unitPaise: number; extra: string; variantId: string | null; addonIds: string[] };
  const lines = useMemo(() => Object.entries(cart).map(([key, qty]) => {
    const item = data.menu.items.find(i => i.id === parseKey(key).itemId);
    const inf = item && lineInfo(item, key);
    return item && inf ? { key, item, qty, ...inf } : null;
  }).filter((l): l is L => !!l), [cart, data]);
  const apiLines = () => lines.map(l => ({ itemId: l.item.id, qty: l.qty, variantId: l.variantId, addonIds: l.addonIds }));
  const key = JSON.stringify(cart) + coupon;

  useEffect(() => {
    if (!open || !lines.length) return;
    const t = setTimeout(async () => {
      try {
        const q = await api<Quote>('/api/cart/quote', { body: { venueId: venue.id, lines: apiLines(), couponCode: coupon } });
        if (q.coupon && !q.coupon.ok && coupon) { toast(q.coupon.error || 'Coupon removed', 'bad'); setCoupon(null); }
        setQuote(q);
      } catch { /* keep last quote */ }
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  useEffect(() => { if (open && !lines.length) onClose(); }, [open, lines.length, onClose]);
  if (!open) return null;

  const apply = async (code: string) => {
    setCodeErr('');
    const q = await api<Quote>('/api/cart/quote', { body: { venueId: venue.id, lines: apiLines(), couponCode: code } }).catch(() => null);
    if (q?.coupon?.ok) { setCoupon(q.coupon.code!); setQuote(q); setCodeInput(''); toast(`${q.coupon.code} applied. You save ${rupee(q.coupon.discount!)}`); }
    else setCodeErr(q?.coupon?.error || 'This code is not valid');
  };

  const place = async () => {
    setPlacing(true);
    try {
      const r = await api<{ order: OrderView }>('/api/orders', { body: {
        visitId: data.visit?.id, lines: apiLines(), couponCode: coupon,
        deliverAt: theater ? deliverAt : 'now', note, payMethod: running ? undefined : payMethod,
      } });
      onPlaced(r.order);
    } catch (e) {
      const err = e as ApiFail;
      if (err.status === 401) onNeedLogin(place);
      else if (err.code === 'RESCAN' || err.code === 'CLOSED') { toast(err.message, 'bad'); onRescan(); }
      else toast(err.message, 'bad');
    } finally { setPlacing(false); }
  };

  const inCart = new Set(lines.map(l => l.item.id));
  const byId = (id: string) => data.menu.items.find(i => i.id === id);
  const meal = (quote?.completeYourMeal || []).map(byId).filter((i): i is Item => !!i && i.available && !hasOpts(i) && !inCart.has(i.id));
  const popular = data.mostOrdered.map(byId).filter((i): i is Item => !!i && i.available && !hasOpts(i) && !inCart.has(i.id) && !meal.some(m => m.id === i.id)).slice(0, 6);
  const best = quote?.coupons.find(c => c.applicable && c.code !== coupon);
  const nextUnlock = quote?.coupons.filter(c => c.addMorePaise > 0).sort((a, b) => a.addMorePaise - b.addMorePaise)[0];
  const ctl = (it: Item) => ({ qty: cart[it.id] || 0, onAdd: () => setQty(it.id, 1), onInc: () => setQty(it.id, (cart[it.id] || 0) + 1), onDec: () => setQty(it.id, (cart[it.id] || 0) - 1) });
  const subtotal = lines.reduce((s, l) => s + l.unitPaise * l.qty, 0);
  const total = quote?.totalPaise ?? subtotal;
  const intervalIn = win.show?.minutesToInterval ?? 0;

  return (
    <div className="anim-fade fixed inset-0 z-40 overflow-y-auto bg-soft" role="dialog" aria-modal="true" aria-label="Your cart">
      <div className="mx-auto max-w-[560px] pb-40">
        <div className="sticky top-0 z-10 flex items-center gap-3 bg-white px-4 py-3.5 shadow-[0_1px_0_var(--line)]">
          <button onClick={onClose} aria-label="Back to menu" className="-ml-1 rounded-full p-1.5 hover:bg-soft"><ArrowLeft size={22} /></button>
          <div className="min-w-0"><p className="truncate font-bold">{data.vendor.name}</p>
            <p className="truncate text-xs text-muted">{data.spot.kind === 'seat' ? `${data.spot.areaName} · Seat ${data.spot.label}` : data.spot.kind === 'table' ? `Table ${data.spot.label}` : 'Counter pickup'}</p></div>
        </div>

        {/* Items */}
        <section className="mx-3 mt-3 rounded-2xl bg-white p-4">
          {lines.map(l => (
            <div key={l.key} className="flex items-center gap-3 py-2.5">
              <VegMark veg={l.item.veg} />
              <div className="min-w-0 flex-1"><p className="text-[15px] leading-snug font-semibold">{l.item.name}</p>{l.extra && <p className="text-[13px] text-ink-2">{l.extra}</p>}<p className="tabular text-[13px] text-muted">{rupee(l.unitPaise)}</p></div>
              <AddButton small qty={l.qty} onAdd={() => setQty(l.key, 1)} onInc={() => setQty(l.key, l.qty + 1)} onDec={() => setQty(l.key, l.qty - 1)} />
              <p className="tabular w-16 text-right text-sm font-semibold">{rupee(l.unitPaise * l.qty)}</p>
            </div>
          ))}
          <div className="mt-2 flex flex-wrap gap-2 border-t border-dashed border-line pt-3">
            <button onClick={onClose} className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-ink-2">+ Add more items</button>
            <button onClick={() => setNoteOpen(o => !o)} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-ink-2"><NotebookPen size={14} />{note ? 'Edit cooking note' : 'Add cooking instructions'}</button>
          </div>
          {noteOpen && <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={200} rows={2} placeholder="Less spicy, no onion, extra ice…" aria-label="Cooking instructions"
            className="mt-3 w-full rounded-xl border border-line p-3 text-sm outline-none focus:border-ink" />}
        </section>

        {/* Coupons */}
        <section className="mx-3 mt-3 rounded-2xl bg-white p-4">
          <h3 className="flex items-center gap-2 text-[15px] font-extrabold"><BadgePercent size={18} className="text-brand-text" />Offers &amp; coupons</h3>
          {coupon && quote?.coupon?.ok ? (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-[#E7F6EF] px-3.5 py-3">
              <div className="flex items-center gap-2 text-sm text-[#11734E]"><Check size={18} strokeWidth={3} /><span><b>{coupon}</b> applied · You saved <b className="tabular">{rupee(quote.discountPaise)}</b></span></div>
              <button onClick={() => setCoupon(null)} className="text-sm font-semibold text-bad">Remove</button>
            </div>
          ) : best ? (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-dashed border-brand-line bg-brand-soft px-3.5 py-3">
              <div className="min-w-0 text-sm"><b>Save {rupee(best.savePaise)}</b> with <b>{best.code}</b><p className="truncate text-xs text-muted">{best.description}</p></div>
              <button onClick={() => apply(best.code)} className="shrink-0 font-extrabold text-brand-text">APPLY</button>
            </div>
          ) : null}
          {nextUnlock && (
            <div className="mt-3 rounded-xl bg-soft px-3.5 py-3 text-sm">
              <p>Add <b className="tabular">{rupee(nextUnlock.addMorePaise)}</b> more to unlock <b>{nextUnlock.code}</b> <span className="text-muted">· save up to {rupee(nextUnlock.savePaise)}</span></p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (subtotal / nextUnlock.minOrderPaise) * 100)}%` }} /></div>
            </div>
          )}
          <form onSubmit={e => { e.preventDefault(); if (codeInput.trim()) apply(codeInput.trim()); }} className="mt-3 flex gap-2">
            <input value={codeInput} onChange={e => setCodeInput(e.target.value.toUpperCase())} placeholder="Enter coupon code" aria-label="Coupon code"
              className="min-w-0 flex-1 rounded-xl border border-line px-3.5 py-2.5 text-sm tracking-wide outline-none focus:border-ink" />
            <button className="rounded-xl px-4 text-sm font-bold text-brand-text disabled:text-faint" disabled={!codeInput.trim()}>Apply</button>
          </form>
          {codeErr && <p className="mt-1.5 text-sm text-bad">{codeErr}</p>}
          {(quote?.coupons.length || 0) > 1 && (
            <>
              <button onClick={() => setAllCoupons(a => !a)} className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-2">
                {allCoupons ? 'Hide coupons' : `View all coupons (${quote!.coupons.length})`}<ChevronDown size={15} className={allCoupons ? 'rotate-180' : ''} />
              </button>
              {allCoupons && (
                <ul className="mt-2 divide-y divide-line">
                  {quote!.coupons.map(c => (
                    <li key={c.code} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0"><b className="tracking-wide">{c.code}</b><p className="text-xs text-muted">{c.description || (c.reason ?? '')}{!c.applicable && c.reason ? ` · ${c.reason}` : ''}</p></div>
                      {c.code === coupon ? <span className="text-xs font-bold text-good">APPLIED</span>
                        : <button disabled={!c.applicable} onClick={() => apply(c.code)} className="font-bold text-brand-text disabled:text-faint">APPLY</button>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        {/* Suggestions under coupons */}
        {meal.length > 0 && (
          <section className="mt-3 bg-white py-4">
            <h3 className="px-4 text-[15px] font-extrabold">Complete your meal</h3>
            <p className="px-4 text-xs text-muted">Often ordered together here</p>
            <div className="no-scrollbar mt-3 flex gap-4 overflow-x-auto px-4 pb-1">{meal.map(it => <MiniCard key={it.id} item={it} category={catName[it.categoryId]} canOrder {...ctl(it)} />)}</div>
          </section>
        )}
        {popular.length > 0 && (
          <section className="mt-3 bg-white py-4">
            <h3 className="px-4 text-[15px] font-extrabold">Most ordered here</h3>
            <div className="no-scrollbar mt-3 flex gap-4 overflow-x-auto px-4 pb-1">{popular.map(it => <MiniCard key={it.id} item={it} category={catName[it.categoryId]} canOrder {...ctl(it)} />)}</div>
          </section>
        )}

        {/* Delivery & payment */}
        {theater && payMethod === 'upi_shop' && (
          <section className="mx-3 mt-3 rounded-2xl bg-white p-4">
            <h3 className="text-[15px] font-extrabold">When should we bring it?</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Choice on={deliverAt === 'now'} onClick={() => setDeliverAt('now')} icon={<Zap size={17} />} title="Right away" sub="About 10–15 min" />
              <Choice on={deliverAt === 'interval'} onClick={() => setDeliverAt('interval')} disabled={intervalIn < 20} icon={<Clapperboard size={17} />}
                title="At the interval" sub={intervalIn >= 20 ? `In ~${intervalIn} min, fresh and hot` : 'Interval too close or over'} />
            </div>
          </section>
        )}
        {running ? (
          <section className="mx-3 mt-3 flex gap-3 rounded-2xl bg-white p-4 text-sm">
            <ReceiptText size={20} className="mt-0.5 shrink-0 text-brand-text" />
            <p><b>Added to your table bill.</b> <span className="text-muted">Order more anytime. Pay once at the end from “Table bill”.</span></p>
          </section>
        ) : (
          <section className="mx-3 mt-3 rounded-2xl bg-white p-4">
            <h3 className="text-[15px] font-extrabold">How will you pay?</h3>
            <div className="mt-3 grid gap-2">
              <Choice on={payMethod === 'upi_shop'} onClick={() => setPayMethod('upi_shop')} icon={<Smartphone size={17} />} title={`UPI to ${venue.upiName || data.vendor.name}`} sub="GPay, PhonePe, Paytm or any UPI app" />
              {venue.acceptCash && <Choice on={payMethod === 'cash'} onClick={() => setPayMethod('cash')} icon={<Banknote size={17} />} title="Cash at the counter"
                sub={theater ? 'Collect your order from the counter' : 'Pay when you collect'} />}
            </div>
          </section>
        )}

        {/* Bill */}
        <section className="mx-3 mt-3 rounded-2xl bg-white p-4 text-sm">
          <h3 className="mb-2 text-[15px] font-extrabold">Bill details</h3>
          {!quote ? <div className="py-3"><Spinner className="text-muted" /></div> : (
            <div className="tabular space-y-1.5">
              <Row l="Item total" r={rupee(quote.subtotalPaise)} />
              {quote.discountPaise > 0 && <Row l={`Coupon (${coupon})`} r={`−${rupee(quote.discountPaise)}`} green />}
              <Row l={`GST (${quote.taxBps / 100}%)`} r={rupee(quote.taxPaise)} />
              <div className="mt-2 flex justify-between border-t border-dashed border-line pt-3 text-[15px] font-extrabold"><span>To pay</span><span>{rupee(quote.totalPaise)}</span></div>
            </div>
          )}
        </section>
        <p className="mx-4 mt-3 text-xs leading-relaxed text-muted">
          {running ? 'Your order goes to the kitchen right away.' : payMethod === 'cash' ? 'Your order is confirmed once you pay at the counter.' : 'Your order goes to the kitchen once the venue confirms your UPI payment.'}
        </p>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[560px] bg-white px-4 pt-3 pb-[calc(14px+env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <Btn tone="brand" size="lg" className="w-full !py-4 !text-base" loading={placing} onClick={() => (data.customer ? place() : onNeedLogin(place))}>
          {running ? 'Send to kitchen' : 'Place order'} · <span className="tabular">{rupee(total)}</span>
        </Btn>
      </div>
    </div>
  );
}

function Choice({ on, onClick, icon, title, sub, disabled }: { on: boolean; onClick: () => void; icon: React.ReactNode; title: string; sub: string; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} aria-pressed={on}
      className={`flex items-start gap-3 rounded-xl border p-3 text-left transition disabled:opacity-45 ${on ? 'border-brand bg-brand-soft shadow-[inset_0_0_0_1px_var(--brand)]' : 'border-line'}`}>
      <span className={on ? 'text-brand-text' : 'text-muted'}>{icon}</span>
      <span className="min-w-0"><b className="block text-sm">{title}</b><span className="text-xs text-muted">{sub}</span></span>
    </button>
  );
}
const Row = ({ l, r, green }: { l: string; r: string; green?: boolean }) => <div className={`flex justify-between ${green ? 'text-good' : 'text-ink-2'}`}><span>{l}</span><span>{r}</span></div>;

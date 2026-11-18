'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bike, Minus, Percent, Plus, Printer, ReceiptText, Search, ShoppingBag, StickyNote, Trash2, User, Utensils, X } from 'lucide-react';
import { api, rupee, store, useRealtime } from '@/lib/client';
import { Btn, Pill, Sheet, Spinner, VegMark, inputCls } from '@/components/ui/kit';
import { useConfirm, useToast } from '@/components/ui/providers';
import { ItemOptions, fromPrice, hasOptions, type OptItem, type Picked } from '@/components/ui/item-options';
import { PaySheet } from './pay-sheet';
import { DiscountSheet, Stepper, discountOf, totals, type Discount } from './pos-parts';
import { TableBillSheet, useTables } from './tables';
import type { Channel, Live, MenuData, MenuItemFull, Order, Payment, Role, VenueCtx } from './types';

type Line = { key: string; itemId: string; name: string; veg: boolean; variantId: string | null; variantName: string | null; addonIds: string[]; addonNames: string[]; unitPaise: number; qty: number; note: string };
type Type = 'dine_in' | 'takeaway' | 'delivery';
const SETTLE: Role[] = ['owner', 'manager', 'cashier', 'captain'];
const DISCOUNT: Role[] = ['owner', 'manager', 'cashier'];

// Billing screen (POS): punch in an order in a few taps, send the KOT, take payment.
export function Pos({ venue, live, role, presetSpot, clearPreset, reload }: {
  venue: VenueCtx; live: Live; role: Role; presetSpot: string | null; clearPreset: () => void; reload: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [menu, setMenu] = useState<MenuData | null>(null);
  const [tax, setTax] = useState({ bps: 500, roundOff: false });
  const { spots, areas } = useTables(venue.id);
  const [cat, setCat] = useState<string>('all');
  const [q, setQ] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [type, setType] = useState<Type>('takeaway');
  const [channel, setChannel] = useState<Channel>('pos');
  const [spotId, setSpotId] = useState<string>('');
  const [guests, setGuests] = useState(2);
  const [guest, setGuest] = useState({ name: '', phone: '', address: '', ref: '' });
  const [showGuest, setShowGuest] = useState(false);
  const [discount, setDiscount] = useState<Discount | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [opt, setOpt] = useState<MenuItemFull | null>(null);
  const [pay, setPay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [last, setLast] = useState<Order | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const canSettle = SETTLE.includes(role);
  const canDiscount = DISCOUNT.includes(role);

  const loadMenu = useCallback(async () => {
    const [m, st] = await Promise.all([api<MenuData>(`/api/staff/v/${venue.id}/menu`), api(`/api/staff/v/${venue.id}/settings`)]);
    setMenu(m); setTax({ bps: st.venue.taxBps, roundOff: !!st.venue.settings?.roundOff });
  }, [venue.id]);
  useEffect(() => { loadMenu(); }, [loadMenu]);
  useRealtime([`venue:${venue.id}`], { menu: () => loadMenu() });

  // Default order type: dine-in where there are tables. A table chosen on the Tables screen arrives as a preset.
  useEffect(() => { if (spots.length && !presetSpot) setType(t => (t === 'takeaway' && store.get(`sv_pos_type_${venue.id}`, 'dine_in') === 'dine_in' ? 'dine_in' : t)); }, [spots.length, venue.id, presetSpot]);
  useEffect(() => { if (presetSpot) { setType('dine_in'); setChannel('pos'); setSpotId(presetSpot); clearPreset(); } }, [presetSpot, clearPreset]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') { e.preventDefault(); searchRef.current?.focus(); } };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  }, []);

  const catLive = useMemo(() => new Map(menu?.categories.map(c => [c.id, c.isLive]) ?? []), [menu]);
  const stLive = useMemo(() => new Map(menu?.stations.map(s => [s.id, s.isLive]) ?? []), [menu]);
  const avail = (i: MenuItemFull) => i.isLive && (catLive.get(i.categoryId) ?? true) && (i.stationId ? stLive.get(i.stationId) ?? true : true);
  const shown = useMemo(() => {
    if (!menu) return [];
    const s = q.trim().toLowerCase();
    return menu.items.filter(i => (s ? i.name.toLowerCase().includes(s) : cat === 'all' || i.categoryId === cat));
  }, [menu, cat, q]);

  const add = (i: MenuItemFull, p?: Picked) => {
    if (!avail(i)) { toast(`${i.name} is switched off (sold out).`, 'bad'); return; }
    if (!p && hasOptions(i)) { setOpt(i); return; }
    const variantId = p?.variantId ?? null, addonIds = p?.addonIds ?? [];
    const key = `${i.id}|${variantId}|${[...addonIds].sort().join(',')}`;
    setLines(ls => {
      const ex = ls.find(l => l.key === key && !l.note);
      if (ex) return ls.map(l => (l === ex ? { ...l, qty: Math.min(99, l.qty + (p?.qty ?? 1)) } : l));
      return [...ls, { key, itemId: i.id, name: i.name, veg: i.veg, variantId, variantName: p?.variantName ?? null, addonIds, addonNames: p?.addonNames ?? [],
        unitPaise: p?.unitPaise ?? i.pricePaise, qty: p?.qty ?? 1, note: '' }];
    });
  };
  const setQty = (key: string, qty: number) => setLines(ls => (qty <= 0 ? ls.filter(l => l.key !== key) : ls.map(l => (l.key === key ? { ...l, qty } : l))));

  const subtotal = lines.reduce((a, l) => a + l.unitPaise * l.qty, 0);
  const disc = discountOf(discount, subtotal);
  const t = totals(subtotal, disc, tax.bps, tax.roundOff);
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const tableBill = type === 'dine_in' && spotId ? live.tables.find(x => x.session.spotId === spotId) : undefined;
  const app = channel === 'zomato' || channel === 'swiggy';

  const reset = () => { setLines([]); setDiscount(null); setGuest({ name: '', phone: '', address: '', ref: '' }); setShowGuest(false); setCartOpen(false); setGuests(2); };
  const send = async (payments?: Payment[]) => {
    if (!lines.length) return;
    if (type === 'dine_in' && !spotId) { toast('Choose a table first.', 'bad'); return; }
    if (app && !guest.ref.trim()) { toast(`Enter the ${channel === 'zomato' ? 'Zomato' : 'Swiggy'} order ID.`, 'bad'); setShowGuest(true); return; }
    setBusy(true);
    try {
      const r = await api<{ order: Order }>(`/api/staff/v/${venue.id}/pos`, {
        body: {
          type, channel: type === 'delivery' ? channel : 'pos', spotId: type === 'dine_in' ? spotId : null, guests: type === 'dine_in' && !tableBill ? guests : undefined,
          lines: lines.map(l => ({ itemId: l.itemId, qty: l.qty, variantId: l.variantId, addonIds: l.addonIds, note: l.note || undefined })),
          guestName: guest.name, guestPhone: guest.phone, address: guest.address, externalRef: guest.ref,
          discount: discount && disc ? discount : null, payments: payments ?? null,
        },
      });
      setLast(r.order); reset(); setPay(false);
      toast(`KOT ${r.order.kotNo} sent to the kitchen · ${r.order.spotLabel}${r.order.payStatus === 'paid' ? ' · paid' : ''}`);
      reload();
    } catch (e) { toast((e as Error).message, 'bad'); }
    finally { setBusy(false); }
  };
  const clearCart = async () => {
    if (!lines.length) return;
    if (await confirm({ title: 'Clear this order?', body: 'All items in the cart are removed. Nothing has been sent to the kitchen yet.', confirm: 'Clear', tone: 'danger' })) reset();
  };
  const chooseType = (x: Type) => { setType(x); store.set(`sv_pos_type_${venue.id}`, x); setChannel(x === 'delivery' ? 'phone' : 'pos'); };

  if (!menu) return <div className="grid place-items-center py-24"><Spinner className="text-muted" /></div>;

  const tables = [...areas.map(a => ({ name: a.name, list: spots.filter(s => s.areaId === a.id) })), { name: 'Tables', list: spots.filter(s => !s.areaId) }].filter(g => g.list.length);
  const cart = (
    <div className="flex h-full flex-col">
      {/* Order type */}
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-soft p-1">
        {([['dine_in', 'Dine-in', Utensils], ['takeaway', 'Takeaway', ShoppingBag], ['delivery', 'Delivery', Bike]] as const).map(([k, l, I]) => (
          <button key={k} onClick={() => chooseType(k)} disabled={k === 'dine_in' && !spots.length} aria-pressed={type === k}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold disabled:opacity-35 ${type === k ? 'bg-white shadow-sm' : 'text-muted'}`}><I size={15} />{l}</button>
        ))}
      </div>

      {type === 'dine_in' && (
        <div className="mt-3 flex items-center gap-2">
          <select value={spotId} onChange={e => setSpotId(e.target.value)} aria-label="Table" className={`${inputCls} py-2 font-semibold`}>
            <option value="">Choose table…</option>
            {tables.map(g => <optgroup key={g.name} label={g.name}>{g.list.map(s => {
              const b = live.tables.find(x => x.session.spotId === s.id);
              return <option key={s.id} value={s.id}>Table {s.label}{b ? ` · running ${rupee(b.duePaise)}` : ' · free'}</option>;
            })}</optgroup>)}
          </select>
          {spotId && !tableBill && <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted">Guests <Stepper value={guests} onChange={setGuests} min={1} label="guests" /></span>}
        </div>
      )}
      {tableBill && (
        <button onClick={() => setBillOpen(true)} className="mt-2 flex items-center justify-between rounded-xl border border-[#F5D7A9] bg-[#FFF8EC] px-3 py-2 text-left text-sm">
          <span><b>Running bill {rupee(tableBill.duePaise)}</b> · {tableBill.rounds.length} KOT{tableBill.rounds.length === 1 ? '' : 's'}</span>
          <span className="flex items-center gap-1 font-semibold text-brand-text"><ReceiptText size={15} />View / settle</span>
        </button>
      )}
      {type === 'delivery' && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {([['phone', 'Own delivery'], ['zomato', 'Zomato'], ['swiggy', 'Swiggy'], ['other', 'Other app']] as const).map(([k, l]) => (
            <button key={k} onClick={() => { setChannel(k); if (k === 'zomato' || k === 'swiggy') setShowGuest(true); }} aria-pressed={channel === k}
              className={`rounded-full border px-3 py-1 text-xs font-bold ${channel === k ? 'border-ink bg-ink text-white' : 'border-line text-ink-2'}`}>{l}</button>
          ))}
        </div>
      )}

      {/* Guest details */}
      <button onClick={() => setShowGuest(s => !s)} className="mt-3 flex items-center gap-2 text-sm font-semibold text-ink-2">
        <User size={15} />{guest.name || guest.phone || guest.ref ? [guest.ref && `#${guest.ref}`, guest.name, guest.phone].filter(Boolean).join(' · ') : app ? 'Order ID & guest (required)' : 'Add guest name / phone'}
      </button>
      {showGuest && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {app && <input value={guest.ref} onChange={e => setGuest(g => ({ ...g, ref: e.target.value }))} placeholder={`${channel === 'zomato' ? 'Zomato' : 'Swiggy'} order ID`} className={`${inputCls} col-span-2 py-2`} />}
          <input value={guest.phone} onChange={e => setGuest(g => ({ ...g, phone: e.target.value.replace(/[^\d]/g, '').slice(0, 10) }))} inputMode="numeric" placeholder="Mobile (optional)" className={`${inputCls} py-2`} />
          <input value={guest.name} onChange={e => setGuest(g => ({ ...g, name: e.target.value }))} placeholder="Name" className={`${inputCls} py-2`} />
          {type === 'delivery' && !app && <textarea value={guest.address} onChange={e => setGuest(g => ({ ...g, address: e.target.value }))} placeholder="Delivery address" rows={2} className={`${inputCls} col-span-2 py-2`} />}
        </div>
      )}

      {/* Lines */}
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto border-t border-line">
        {lines.map(l => (
          <div key={l.key} className="border-b border-line py-2.5">
            <div className="flex items-start gap-2">
              <span className="mt-1"><VegMark veg={l.veg} size={11} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug font-semibold">{l.name}{l.variantName && <span className="text-muted"> ({l.variantName})</span>}</p>
                {l.addonNames.length > 0 && <p className="text-xs text-muted">+ {l.addonNames.join(', ')}</p>}
                {noteFor === l.key ? (
                  <input autoFocus value={l.note} onChange={e => setLines(ls => ls.map(x => (x.key === l.key ? { ...x, note: e.target.value.slice(0, 120) } : x)))} onBlur={() => setNoteFor(null)}
                    onKeyDown={e => e.key === 'Enter' && setNoteFor(null)} placeholder="e.g. less spicy, no onion" className="mt-1 w-full rounded-lg border border-line px-2 py-1 text-xs outline-none focus:border-ink" />
                ) : (
                  <button onClick={() => setNoteFor(l.key)} className={`mt-0.5 flex items-center gap-1 text-xs ${l.note ? 'font-semibold text-[#7A4A00]' : 'text-muted'}`}><StickyNote size={12} />{l.note || 'Add note for kitchen'}</button>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="tabular text-sm font-bold">{rupee(l.unitPaise * l.qty)}</span>
                <span className="inline-flex items-center rounded-lg border border-line">
                  <button onClick={() => setQty(l.key, l.qty - 1)} className="p-1.5 text-ink-2" aria-label={`Less ${l.name}`}>{l.qty === 1 ? <Trash2 size={13} /> : <Minus size={13} />}</button>
                  <span className="tabular w-6 text-center text-sm font-bold">{l.qty}</span>
                  <button onClick={() => setQty(l.key, l.qty + 1)} className="p-1.5 text-ink-2" aria-label={`More ${l.name}`}><Plus size={13} /></button>
                </span>
              </div>
            </div>
          </div>
        ))}
        {!lines.length && <p className="py-10 text-center text-sm text-muted">Tap items to add them.<br /><span className="text-xs">Press <kbd className="rounded border border-line px-1">/</kbd> to search.</span></p>}
      </div>

      {/* Totals + actions */}
      {lines.length > 0 && (
        <div className="tabular space-y-1 border-t border-line pt-2 text-sm">
          <div className="flex justify-between"><span>{count} item{count === 1 ? '' : 's'}</span><span>{rupee(subtotal)}</span></div>
          {canDiscount && (disc ? (
            <div className="flex justify-between text-good"><button onClick={() => setDiscount(null)} className="flex items-center gap-1 font-semibold">Discount · {discount!.reason}<X size={13} /></button><span>−{rupee(disc)}</span></div>
          ) : <button onClick={() => setNoteFor('__discount')} className="flex items-center gap-1 text-xs font-semibold text-brand-text"><Percent size={13} />Add discount</button>)}
          <div className="flex justify-between text-muted"><span>GST {tax.bps / 100}%</span><span>{rupee(t.tax)}</span></div>
          {t.roundOff !== 0 && <div className="flex justify-between text-muted"><span>Round off</span><span>{t.roundOff > 0 ? '+' : '−'}{rupee(Math.abs(t.roundOff))}</span></div>}
          <div className="flex justify-between pt-1 text-lg font-extrabold"><span>Total</span><span>{rupee(t.total)}</span></div>
        </div>
      )}
      <div className="mt-3 grid grid-cols-[auto_1fr_1fr] gap-2">
        <button onClick={clearCart} disabled={!lines.length} className="rounded-xl border border-line px-3 text-muted disabled:opacity-40" aria-label="Clear order"><Trash2 size={17} /></button>
        {type === 'dine_in' ? (
          <Btn tone="dark" size="lg" className="col-span-2" disabled={!lines.length || !spotId} loading={busy} onClick={() => send()}>Send KOT{spotId ? ` · Table ${spots.find(s => s.id === spotId)?.label}` : ''}</Btn>
        ) : app ? (
          <Btn tone="dark" size="lg" className="col-span-2" disabled={!lines.length} loading={busy} onClick={() => send()}>Accept & send KOT · paid online</Btn>
        ) : (
          <>
            <Btn tone="outline" size="lg" disabled={!lines.length} loading={busy && !pay} onClick={() => send()}>KOT · pay later</Btn>
            <Btn tone="good" size="lg" disabled={!lines.length || !canSettle} onClick={() => setPay(true)}>KOT & pay</Btn>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="lg:-my-2">
      <div className="grid gap-4 lg:h-[calc(100dvh-48px)] lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[170px_minmax(0,1fr)_400px]">
        {/* Categories */}
        <nav className="no-scrollbar flex gap-1.5 overflow-x-auto lg:col-span-2 xl:col-span-1 xl:flex-col xl:overflow-y-auto">
          {[{ id: 'all', name: 'All items' }, ...menu.categories].map(c => (
            <button key={c.id} onClick={() => { setCat(c.id); setQ(''); }} aria-pressed={cat === c.id && !q}
              className={`shrink-0 rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold whitespace-nowrap ${cat === c.id && !q ? 'bg-ink text-white' : 'bg-white text-ink-2 hover:bg-soft'}`}>{c.name}</button>
          ))}
        </nav>

        {/* Items */}
        <section className="flex min-h-0 flex-col">
          <label className="mb-3 flex items-center gap-2 rounded-xl border border-line bg-white px-3 focus-within:border-ink">
            <Search size={17} className="text-muted" />
            <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search items  ( / )" aria-label="Search items"
              onKeyDown={e => { if (e.key === 'Enter' && shown[0]) { add(shown[0]); setQ(''); } if (e.key === 'Escape') setQ(''); }}
              className="w-full py-2.5 text-[15px] outline-none" />
            {q && <button onClick={() => setQ('')} aria-label="Clear search" className="text-muted"><X size={16} /></button>}
          </label>
          {last && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-[#E7F6EF] px-3 py-2 text-sm text-[#11734E]">
              <b>KOT {last.kotNo}</b>· {last.spotLabel} · {rupee(last.totalPaise)} {last.payStatus === 'paid' ? '· paid' : last.payStatus === 'on_bill' ? '· on table bill' : '· to pay'}
              <span className="ml-auto flex gap-1">
                <a href={`/print/kot/${last.id}`} target="_blank" rel="noopener" className="flex items-center gap-1 rounded-lg px-2 py-1 font-semibold hover:bg-white/60"><Printer size={14} />KOT</a>
                {last.payStatus === 'paid' && <a href={`/print/invoice/${last.id}`} target="_blank" rel="noopener" className="flex items-center gap-1 rounded-lg px-2 py-1 font-semibold hover:bg-white/60"><ReceiptText size={14} />Bill</a>}
                <button onClick={() => setLast(null)} aria-label="Hide" className="rounded-lg px-1.5 hover:bg-white/60"><X size={14} /></button>
              </span>
            </div>
          )}
          <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto pb-24 sm:grid-cols-3 lg:pb-2 2xl:grid-cols-4">
            {shown.map(i => {
              const inCart = lines.filter(l => l.itemId === i.id).reduce((a, l) => a + l.qty, 0);
              const on = avail(i);
              return (
                <button key={i.id} onClick={() => add(i)} disabled={!on}
                  className={`relative flex min-h-[84px] flex-col rounded-xl border bg-white p-3 text-left transition active:scale-[.98] disabled:opacity-45 ${inCart ? 'border-brand ring-1 ring-brand' : 'border-line hover:border-ink-2'}`}>
                  {inCart > 0 && <span className="tabular absolute top-2 right-2 grid h-6 min-w-6 place-items-center rounded-full bg-brand px-1.5 text-xs font-bold text-brand-ink">{inCart}</span>}
                  <span className="flex items-start gap-1.5 pr-6"><span className="mt-1"><VegMark veg={i.veg} size={11} /></span><span className="text-sm leading-snug font-semibold">{i.name}</span></span>
                  <span className="mt-auto flex items-center justify-between pt-1.5 text-sm">
                    <span className="tabular font-bold text-ink-2">{i.variants.length ? `from ${rupee(fromPrice(i))}` : rupee(i.pricePaise)}</span>
                    {!on ? <Pill tone="bad">Off</Pill> : hasOptions(i) ? <span className="text-[11px] font-semibold text-muted">{i.variants.length ? i.variants.map(v => v.name).join(' / ') : 'Add-ons'}</span> : null}
                  </span>
                </button>
              );
            })}
            {!shown.length && <p className="col-span-full py-10 text-center text-sm text-muted">{q ? `Nothing matches “${q}”.` : 'No items in this category.'}</p>}
          </div>
        </section>

        {/* Cart: side panel on large screens */}
        <aside className="hidden min-h-0 rounded-2xl bg-white p-4 lg:block">{cart}</aside>
      </div>

      {/* Cart: bottom bar + sheet on phones and tablets */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white p-3 pb-[calc(12px+env(safe-area-inset-bottom))] lg:hidden">
        <Btn tone="dark" size="lg" className="w-full justify-between" onClick={() => setCartOpen(true)}>
          <span>{count ? `${count} item${count === 1 ? '' : 's'} · ${rupee(t.total)}` : type === 'dine_in' ? 'Choose table & items' : 'Cart is empty'}</span><span>View order →</span>
        </Btn>
      </div>
      <Sheet open={cartOpen && !pay && !opt && noteFor !== '__discount' && !billOpen} onClose={() => setCartOpen(false)} title="Current order" full>
        <div className="h-full p-4">{cart}</div>
      </Sheet>

      <ItemOptions item={opt as OptItem | null} open={!!opt} onClose={() => setOpt(null)} onAdd={p => opt && add(opt, p)} />
      <DiscountSheet open={noteFor === '__discount'} onClose={() => setNoteFor(null)} subtotalPaise={subtotal} current={discount} onApply={d => setDiscount(d)} />
      <PaySheet open={pay} onClose={() => setPay(false)} title="Take payment & send KOT" amountPaise={t.total} onPay={p => send(p)} />
      {tableBill && <TableBillSheet bill={billOpen ? tableBill : null} live={live} spots={spots} role={role} onClose={() => setBillOpen(false)} reload={reload} />}
    </div>
  );
}

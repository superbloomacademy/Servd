'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Armchair, Bike, ChevronDown, Minus, PauseCircle, Percent, Plus, Printer, ReceiptText, RotateCcw, Search, ShoppingBag, Star, StickyNote, Trash2, User, Utensils, X } from 'lucide-react';
import { api, clock, printQuietly, rupee, store, timeAgo, useRealtime } from '@/lib/client';
import { Btn, Pill, Sheet, Spinner, VegMark, inputCls } from '@/components/ui/kit';
import { useConfirm, useToast } from '@/components/ui/providers';
import { ItemOptions, fromPrice, hasOptions, type OptItem, type Picked } from '@/components/ui/item-options';
import { PaySheet } from './pay-sheet';
import { DiscountSheet, Stepper, discountOf, totals, type Discount } from './pos-parts';
import { PosFloor } from './pos-floor';
import { TableBillSheet, useTables } from './tables';
import type { Channel, Live, MenuData, MenuItemFull, Order, Payment, Role, VenueCtx } from './types';

type Line = { key: string; itemId: string; name: string; veg: boolean; variantId: string | null; variantName: string | null; addonIds: string[]; addonNames: string[]; unitPaise: number; qty: number; note: string };
type Type = 'dine_in' | 'takeaway' | 'delivery';
type Guest = { name: string; phone: string; address: string; ref: string };
/** Everything about an order that has not been sent yet. Kept on this device, so leaving the screen never loses it. */
type Draft = { lines: Line[]; type: Type; channel: Channel; spotId: string; guests: number; guest: Guest; discount: Discount | null };
type Held = Draft & { id: string; at: string };
const SETTLE: Role[] = ['owner', 'manager', 'cashier', 'captain'];
const DISCOUNT: Role[] = ['owner', 'manager', 'cashier'];
const NOTES = ['Less spicy', 'Extra spicy', 'No onion', 'No garlic', 'Less oil', 'Parcel'];
const NO_GUEST: Guest = { name: '', phone: '', address: '', ref: '' };
let seq = 0;
/** Same dish, size, add-ons and note: one line, higher quantity. */
const same = (a: Line, b: Line) => a.itemId === b.itemId && a.variantId === b.variantId && a.note === b.note && [...a.addonIds].sort().join() === [...b.addonIds].sort().join();

/** Builds a cart line from the menu as it is now, so prices are never old. Null when the dish, size or add-on is gone. */
function makeLine(menu: MenuData, itemId: string, variantId: string | null, addonIds: string[], qty: number, note = ''): Line | null {
  const i = menu.items.find(x => x.id === itemId);
  if (!i) return null;
  const v = variantId ? i.variants.find(x => x.id === variantId) : null;
  if ((variantId && !v) || (!variantId && i.variants.length)) return null;
  const adds = addonIds.map(id => i.addonGroups.flatMap(g => g.options).find(o => o.id === id));
  if (adds.some(a => !a)) return null;
  return { key: `l${++seq}`, itemId, name: i.name, veg: i.veg, variantId, variantName: v?.name ?? null, addonIds, addonNames: adds.map(a => a!.name),
    unitPaise: (v ? v.pricePaise : i.pricePaise) + adds.reduce((a, o) => a + o!.pricePaise, 0), qty, note };
}
/** "2*bc" or "2x bc" → 2 of the dish with code BC. */
function parseQuery(q: string) {
  const m = q.trim().match(/^(\d{1,2})\s*[*x×]\s*(.+)$/i);
  return m ? { n: Math.max(1, Number(m[1])), term: m[2].trim().toLowerCase() } : { n: 1, term: q.trim().toLowerCase() };
}

// Billing screen (POS): pick a table, punch dishes in a few taps or by short code, send the KOT, take payment.
export function Pos({ venue, live, role, presetSpot, clearPreset, reload }: {
  venue: VenueCtx; live: Live; role: Role; presetSpot: string | null; clearPreset: () => void; reload: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const K = { draft: `sv_draft_${venue.id}`, held: `sv_held_${venue.id}`, type: `sv_pos_type_${venue.id}`, kot: `sv_print_kot_${venue.id}`, bill: `sv_print_bill_${venue.id}` };
  const [menu, setMenu] = useState<MenuData | null>(null);
  const [failed, setFailed] = useState('');
  const [tax, setTax] = useState({ bps: 500, roundOff: false });
  const { spots, areas, loaded } = useTables(venue.id);
  useEffect(() => { if (loaded && !spots.length) { setType(x => (x === 'dine_in' ? 'takeaway' : x)); setPane('menu'); } }, [loaded, spots.length]);
  const [cat, setCat] = useState<string>('');
  const [q, setQ] = useState('');
  const [pane, setPane] = useState<'tables' | 'menu'>('menu');
  const [lines, setLines] = useState<Line[]>([]);
  const [type, setType] = useState<Type>('takeaway');
  const [channel, setChannel] = useState<Channel>('pos');
  const [spotId, setSpotId] = useState<string>('');
  const [guests, setGuests] = useState(2);
  const [guest, setGuest] = useState<Guest>(NO_GUEST);
  const [discount, setDiscount] = useState<Discount | null>(null);
  const [showGuest, setShowGuest] = useState(false);
  const [discOpen, setDiscOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [opt, setOpt] = useState<{ item: MenuItemFull; n: number } | null>(null);
  const [pay, setPay] = useState<'order' | 'table' | null>(null);
  const [busy, setBusy] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [held, setHeld] = useState<Held[]>([]);
  const [sentOpen, setSentOpen] = useState(true);
  const [prints, setPrints] = useState({ kot: false, bill: false });
  const [last, setLast] = useState<{ text: string; kot?: string; bill?: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const ready = useRef(false);
  const canSettle = SETTLE.includes(role), canDiscount = DISCOUNT.includes(role);

  const loadMenu = useCallback(async () => {
    try {
      const [m, st] = await Promise.all([api<MenuData>(`/api/staff/v/${venue.id}/menu`), api(`/api/staff/v/${venue.id}/settings`)]);
      setMenu(m); setTax({ bps: st.venue.taxBps, roundOff: !!st.venue.settings?.roundOff }); setFailed('');
    } catch (e) { setFailed((e as Error).message); }
  }, [venue.id]);
  useEffect(() => { loadMenu(); }, [loadMenu]);
  useRealtime([`venue:${venue.id}`], { menu: () => loadMenu() });

  // ---- unsent order: restored when this screen opens, saved on every change
  const apply = useCallback((d: Draft, m: MenuData) => {
    const ls = d.lines.map(l => makeLine(m, l.itemId, l.variantId, l.addonIds, l.qty, l.note)).filter((l): l is Line => !!l);
    if (ls.length < d.lines.length) toast(`${d.lines.length - ls.length} dish(es) are no longer on the menu and were left out.`, 'bad');
    setLines(ls); setType(d.type); setChannel(d.channel); setSpotId(d.spotId); setGuests(d.guests); setGuest(d.guest); setDiscount(d.discount);
    setPane(d.type === 'dine_in' && !d.spotId ? 'tables' : 'menu');
  }, [toast]);
  const draft: Draft = { lines, type, channel, spotId, guests, guest, discount };
  useEffect(() => {
    if (!menu || ready.current) return;
    ready.current = true;
    setHeld(store.get<Held[]>(K.held, [])); setPrints({ kot: store.get(K.kot, false), bill: store.get(K.bill, false) });
    setCat(menu.items.some(i => i.favourite) ? 'fav' : 'all');
    const saved = store.get<Draft | null>(K.draft, null);
    if (saved?.lines?.length) { apply(saved, menu); return; }
    const t0 = store.get<Type>(K.type, venue.serviceMode.startsWith('table') ? 'dine_in' : 'takeaway');
    setType(t0); setChannel(t0 === 'delivery' ? 'phone' : 'pos'); setPane(t0 === 'dine_in' ? 'tables' : 'menu');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu]);
  useEffect(() => { if (ready.current) { if (lines.length) store.set(K.draft, draft); else store.del(K.draft); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, type, channel, spotId, guests, guest, discount]);
  const saveHeld = (h: Held[]) => { setHeld(h); store.set(K.held, h); };
  const clear = () => { setLines([]); setDiscount(null); setGuest(NO_GUEST); setShowGuest(false); setCartOpen(false); setGuests(2); setNoteFor(null); };
  const label = (d: Draft) => (d.type === 'dine_in' ? `Table ${spots.find(s => s.id === d.spotId)?.label ?? '?'}` : d.type === 'takeaway' ? 'Takeaway' : 'Delivery') + (d.guest.name ? ` · ${d.guest.name}` : '');
  const holdDraft = (d: Draft, list: Held[]) => [{ ...d, id: `${Date.now()}`, at: new Date().toISOString() }, ...list].slice(0, 30);
  const hold = () => {
    if (!lines.length) return;
    if (held.length >= 30) { toast('30 orders are already on hold. Finish or remove one first.', 'bad'); return; }
    saveHeld(holdDraft(draft, held)); toast(`${label(draft)} is on hold. Nothing was sent to the kitchen.`);
    clear(); setSpotId(''); if (type === 'dine_in') setPane('tables');
  };
  const resume = (h: Held) => {
    if (!menu) return;
    const rest = held.filter(x => x.id !== h.id);
    saveHeld(lines.length ? holdDraft(draft, rest) : rest);
    if (lines.length) toast(`${label(draft)} went on hold.`);
    apply(h, menu); setHeldOpen(false);
  };

  // A table chosen on the Tables screen. An unsent order for another table goes on hold instead of moving along.
  useEffect(() => {
    if (!presetSpot || !ready.current) return;
    // Read what is saved, not what is on screen: the saved order may only just be loading.
    const d = store.get<Draft | null>(K.draft, null);
    if (d?.lines?.length && (d.type !== 'dine_in' || d.spotId !== presetSpot)) { saveHeld(holdDraft(d, store.get<Held[]>(K.held, []))); toast('The order you had not sent went on hold.'); clear(); }
    setType('dine_in'); setChannel('pos'); setSpotId(presetSpot); setPane('menu'); clearPreset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetSpot, menu]);

  const catLive = useMemo(() => new Map(menu?.categories.map(c => [c.id, c.isLive]) ?? []), [menu]);
  const stLive = useMemo(() => new Map(menu?.stations.map(s => [s.id, s.isLive]) ?? []), [menu]);
  const avail = useCallback((i: MenuItemFull) => i.isLive && (catLive.get(i.categoryId) ?? true) && (i.stationId ? stLive.get(i.stationId) ?? true : true), [catLive, stLive]);
  const query = parseQuery(q);
  const shown = useMemo(() => {
    if (!menu) return [];
    if (!query.term) return menu.items.filter(i => cat === 'all' || (cat === 'fav' ? i.favourite : i.categoryId === cat));
    const rank = (i: MenuItemFull) => { const n = i.name.toLowerCase(), c = i.shortCode.toLowerCase(); return c === query.term ? 0 : c && c.startsWith(query.term) ? 1 : n.startsWith(query.term) ? 2 : n.split(/\s+/).some(w => w.startsWith(query.term)) ? 3 : n.includes(query.term) ? 4 : 9; };
    return menu.items.map(i => ({ i, r: rank(i) })).filter(x => x.r < 9).sort((a, b) => a.r - b.r).map(x => x.i);
  }, [menu, cat, query.term]);
  const groups = useMemo(() => (query.term || cat !== 'all' || !menu ? [{ name: '', list: shown }] : menu.categories.map(c => ({ name: c.name, list: shown.filter(i => i.categoryId === c.id) })).filter(g => g.list.length)), [shown, query.term, cat, menu]);

  const push = (l: Line) => setLines(ls => {
    const ex = ls.find(x => same(x, l));
    return ex ? ls.map(x => (x === ex ? { ...x, qty: Math.min(99, x.qty + l.qty) } : x)) : [...ls, l];
  });
  const add = (i: MenuItemFull, n = 1, p?: Picked) => {
    if (!menu) return;
    if (!avail(i)) { toast(`${i.name} is switched off (sold out).`, 'bad'); return; }
    if (!p && hasOptions(i)) { setOpt({ item: i, n }); return; }
    const l = makeLine(menu, i.id, p?.variantId ?? null, p?.addonIds ?? [], p ? (p.qty === 1 ? n : p.qty) : n);
    if (l) push(l);
  };
  const setQty = (key: string, qty: number) => setLines(ls => (qty <= 0 ? ls.filter(l => l.key !== key) : ls.map(l => (l.key === key ? { ...l, qty: Math.min(99, qty) } : l))));
  const setNote = (key: string, note: string) => setLines(ls => ls.map(x => (x.key === key ? { ...x, note: note.slice(0, 120) } : x)));

  const subtotal = lines.reduce((a, l) => a + l.unitPaise * l.qty, 0);
  const disc = discountOf(discount, subtotal);
  const t = totals(subtotal, disc, tax.bps, tax.roundOff);
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const tableBill = type === 'dine_in' && spotId ? live.tables.find(x => x.session.spotId === spotId) : undefined;
  const sent = (tableBill?.rounds ?? []).filter(r => !['cancelled', 'rejected'].includes(r.status));
  const waiting = sent.some(r => r.awaitingStaff);
  const app = channel === 'zomato' || channel === 'swiggy';
  const spot = spots.find(s => s.id === spotId);

  const send = async (payments?: Payment[]) => {
    if (!lines.length || busy) return;
    if (type === 'dine_in' && !spotId) { toast('Choose a table first.', 'bad'); setPane('tables'); setCartOpen(false); return; }
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
      const o = r.order, paid = o.payStatus === 'paid';
      setLast({ text: `KOT ${o.kotNo} sent · ${o.spotLabel} · ${rupee(o.totalPaise)}${paid ? ' · paid' : o.payStatus === 'on_bill' ? '' : ' · to pay'}`, kot: `/print/kot/${o.id}`, bill: paid ? `/print/invoice/${o.id}` : undefined });
      if (prints.kot) printQuietly(`/print/kot/${o.id}`);
      if (prints.bill && paid) printQuietly(`/print/invoice/${o.id}?print=1`);
      clear(); setPay(null); setQ('');
      if (type === 'dine_in') { setSpotId(''); setPane('tables'); }
      toast(`KOT ${o.kotNo} sent to the kitchen · ${o.spotLabel}${paid ? ' · paid' : ''}`);
      reload();
    } catch (e) { toast((e as Error).message, 'bad'); }
    finally { setBusy(false); }
  };
  const settleTable = async (payments: Payment[]) => {
    if (!tableBill) return;
    const id = tableBill.session.id, name = tableBill.spotLabel;
    try {
      await api(`/api/staff/tables/${id}`, { body: { action: 'close', payments } });
      setLast({ text: `${name} settled · ${rupee(tableBill.duePaise)}`, bill: `/print/table/${id}` });
      if (prints.bill) printQuietly(`/print/table/${id}?print=1`);
      setPay(null); setCartOpen(false); setSpotId(''); setPane('tables'); toast(`${name} settled and free`); reload();
    } catch (e) { toast((e as Error).message, 'bad'); }
  };
  const repeatLast = () => {
    const r = sent[sent.length - 1];
    if (!menu || !r) return;
    let missed = 0;
    for (const i of r.items) { const it = menu.items.find(x => x.id === i.itemId); const l = it && avail(it) ? makeLine(menu, it.id, i.variantId, i.addonIds, i.qty, i.note) : null; if (l) push(l); else missed++; }
    toast(missed ? `KOT ${r.kotNo} repeated, ${missed} dish(es) not available now.` : `KOT ${r.kotNo} repeated. Check it and send.`, missed ? 'bad' : undefined);
  };
  const clearCart = async () => {
    if (lines.length && await confirm({ title: 'Clear this order?', body: 'All items in the cart are removed. Nothing has been sent to the kitchen yet.', confirm: 'Clear', tone: 'danger' })) clear();
  };
  const chooseType = (x: Type) => { setType(x); store.set(K.type, x); setChannel(x === 'delivery' ? 'phone' : 'pos'); setPane(x === 'dine_in' && !spotId ? 'tables' : 'menu'); };
  const pickTable = (id: string) => { setSpotId(id); setPane('menu'); setSentOpen(true); if (window.innerWidth >= 1024) setTimeout(() => searchRef.current?.focus(), 50); };
  const flip = (k: 'kot' | 'bill') => { const n = { ...prints, [k]: !prints[k] }; setPrints(n); store.set(K[k], n[k]); };

  // Keyboard: / search · F2 hold · F4 send KOT · F8 pay or settle · F9 tables
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = e => {
    const el = document.activeElement, typing = el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.tagName === 'SELECT';
    if (pay || opt || discOpen || billOpen || heldOpen || document.querySelector('[role=dialog], [role=alertdialog]')) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
    if (e.key === '/' && !typing) { e.preventDefault(); setPane('menu'); setTimeout(() => searchRef.current?.focus(), 30); }
    if (e.key === 'F2') { e.preventDefault(); hold(); }
    if (e.key === 'F4') { e.preventDefault(); send(); }
    if (e.key === 'F8') { e.preventDefault(); if (!canSettle) return; if (type === 'dine_in') { if (!lines.length && tableBill && sent.length && !waiting) setPay('table'); } else if (lines.length && !app) setPay('order'); }
    if (e.key === 'F9' && spots.length) { e.preventDefault(); if (type !== 'dine_in') chooseType('dine_in'); setPane('tables'); }
  };
  useEffect(() => { const k = (e: KeyboardEvent) => keys.current(e); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, []);

  if (failed && !menu) return <div className="grid place-items-center gap-3 py-24 text-center"><p className="text-sm text-bad">{failed}</p><Btn tone="dark" onClick={loadMenu}>Try again</Btn></div>;
  if (!menu) return <div className="grid place-items-center py-24"><Spinner className="text-muted" /></div>;

  const favs = menu.items.some(i => i.favourite);
  const kbd = (k: string) => <kbd className="ml-1 hidden rounded border border-current px-1 text-[10px] font-semibold opacity-60 xl:inline">{k}</kbd>;
  const cart = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid shrink-0 grid-cols-3 gap-1 rounded-xl bg-soft p-1">
        {([['dine_in', 'Dine-in', Utensils], ['takeaway', 'Takeaway', ShoppingBag], ['delivery', 'Delivery', Bike]] as const).map(([k, l, I]) => (
          <button key={k} onClick={() => chooseType(k)} disabled={k === 'dine_in' && !spots.length} aria-pressed={type === k}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold disabled:opacity-35 ${type === k ? 'bg-white shadow-sm' : 'text-muted'}`}><I size={15} />{l}</button>
        ))}
      </div>

      <div className="mt-2 flex shrink-0 flex-wrap items-center gap-2">
        {type === 'dine_in' && (
          <button onClick={() => { setPane('tables'); setCartOpen(false); }} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${spot ? 'border-line' : 'border-brand bg-brand-soft text-brand-text'}`}>
            <Armchair size={16} />{spot ? `Table ${spot.label}` : 'Choose table'}<ChevronDown size={14} />
          </button>
        )}
        {type === 'dine_in' && spot && !tableBill && <span className="flex items-center gap-1 text-xs font-semibold text-muted">Guests <Stepper value={guests} onChange={setGuests} min={1} label="guests" /></span>}
        {type === 'delivery' && ([['phone', 'Own'], ['zomato', 'Zomato'], ['swiggy', 'Swiggy'], ['other', 'Other']] as const).map(([k, l]) => (
          <button key={k} onClick={() => { setChannel(k); if (k === 'zomato' || k === 'swiggy') setShowGuest(true); }} aria-pressed={channel === k}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${channel === k ? 'border-ink bg-ink text-white' : 'border-line text-ink-2'}`}>{l}</button>
        ))}
        <button onClick={() => setShowGuest(s => !s)} aria-expanded={showGuest} className="ml-auto flex min-w-0 items-center gap-1.5 py-1.5 text-xs font-semibold text-ink-2">
          <User size={14} className="shrink-0" /><span className="truncate">{guest.name || guest.phone || guest.ref ? [guest.ref && `#${guest.ref}`, guest.name || guest.phone].filter(Boolean).join(' · ') : app ? 'Order ID (required)' : 'Guest'}</span>
        </button>
      </div>
      {showGuest && (
        <div className="mt-2 grid shrink-0 grid-cols-2 gap-2">
          {app && <input value={guest.ref} onChange={e => setGuest(g => ({ ...g, ref: e.target.value }))} placeholder={`${channel === 'zomato' ? 'Zomato' : 'Swiggy'} order ID`} className={`${inputCls} col-span-2 py-2`} />}
          <input value={guest.phone} onChange={e => setGuest(g => ({ ...g, phone: e.target.value.replace(/[^\d]/g, '').slice(0, 10) }))} inputMode="numeric" placeholder="Mobile (optional)" aria-label="Guest mobile" className={`${inputCls} py-2`} />
          <input value={guest.name} onChange={e => setGuest(g => ({ ...g, name: e.target.value }))} placeholder="Name" aria-label="Guest name" className={`${inputCls} py-2`} />
          {type === 'delivery' && !app && <textarea value={guest.address} onChange={e => setGuest(g => ({ ...g, address: e.target.value }))} placeholder="Delivery address" rows={2} className={`${inputCls} col-span-2 py-2`} />}
        </div>
      )}
      {waiting && <button onClick={() => setBillOpen(true)} className="mt-2 shrink-0 rounded-xl bg-[#FDECEE] px-3 py-2 text-left text-sm font-semibold text-[#B42334]">A guest’s first QR order is waiting. Open to accept or decline →</button>}

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto border-t border-line">
        {sent.length > 0 && (
          <div className="border-b border-line bg-[#FFF8EC] px-2.5 py-2">
            <div className="flex items-center gap-2 text-sm">
              <button onClick={() => setSentOpen(o => !o)} aria-expanded={sentOpen} className="flex flex-1 items-center gap-1.5 text-left font-bold"><ChevronDown size={15} className={sentOpen ? '' : '-rotate-90'} />Already sent · {sent.length} KOT{sent.length === 1 ? '' : 's'}</button>
              <button onClick={repeatLast} className="flex items-center gap-1 text-xs font-semibold text-brand-text"><RotateCcw size={13} />Repeat last</button>
              <button onClick={() => setBillOpen(true)} className="flex items-center gap-1 text-xs font-semibold text-brand-text"><ReceiptText size={13} />Bill</button>
            </div>
            {sentOpen && sent.map(r => (
              <div key={r.id} className="mt-1.5 text-[13px] text-ink-2"><p className="text-[11px] font-semibold text-muted">KOT {r.kotNo} · {clock(r.createdAt)} · {r.awaitingStaff ? 'not accepted' : ({ confirmed: 'in kitchen', preparing: 'cooking', ready: 'ready', out: 'on the way', delivered: 'served' } as Record<string, string>)[r.status] ?? r.status}</p>
                {r.items.map(i => <p key={i.id} className="flex justify-between gap-2"><span className="truncate">{i.qty} × {i.name}</span><span className="tabular">{rupee(i.qty * i.pricePaise)}</span></p>)}</div>
            ))}
          </div>
        )}
        {lines.map(l => (
          <div key={l.key} className="border-b border-line py-2">
            <div className="flex items-start gap-2">
              <span className="mt-[5px] flex shrink-0"><VegMark veg={l.veg} size={11} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug font-semibold">{l.name}{l.variantName && <span className="text-muted"> ({l.variantName})</span>}</p>
                {l.addonNames.length > 0 && <p className="text-xs text-muted">+ {l.addonNames.join(', ')}</p>}
                {noteFor !== l.key && <button onClick={() => setNoteFor(l.key)} className={`flex items-center gap-1 py-0.5 text-xs ${l.note ? 'font-semibold text-[#7A4A00]' : 'text-muted'}`}><StickyNote size={12} />{l.note || 'Note'}</button>}
              </div>
              <span className="inline-flex shrink-0 items-center rounded-lg border border-line">
                <button onClick={() => setQty(l.key, l.qty - 1)} className="grid h-8 w-8 place-items-center text-ink-2" aria-label={`Less ${l.name}`}>{l.qty === 1 ? <Trash2 size={14} /> : <Minus size={14} />}</button>
                <input value={l.qty} inputMode="numeric" aria-label={`Quantity of ${l.name}`} onFocus={e => e.target.select()} onChange={e => { const n = Number(e.target.value.replace(/\D/g, '')); if (n > 0) setQty(l.key, n); }} className="tabular w-7 bg-transparent text-center text-sm font-bold outline-none" />
                <button onClick={() => setQty(l.key, l.qty + 1)} className="grid h-8 w-8 place-items-center text-ink-2" aria-label={`More ${l.name}`}><Plus size={14} /></button>
              </span>
              <span className="tabular w-16 shrink-0 pt-1.5 text-right text-sm font-bold">{rupee(l.unitPaise * l.qty)}</span>
            </div>
            {noteFor === l.key && (
              <div className="mt-1 pl-5">
                <input autoFocus value={l.note} onChange={e => setNote(l.key, e.target.value)} onBlur={() => setNoteFor(null)} onKeyDown={e => e.key === 'Enter' && setNoteFor(null)} placeholder="Note for the kitchen" aria-label={`Note for ${l.name}`} className="w-full rounded-lg border border-line px-2 py-1.5 text-sm outline-none focus:border-ink" />
                <div className="mt-1.5 flex flex-wrap gap-1">{NOTES.map(n => <button key={n} onMouseDown={e => e.preventDefault()} onClick={() => setNote(l.key, l.note.includes(n) ? l.note : [l.note, n].filter(Boolean).join(', '))} className="rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-ink-2">{n}</button>)}</div>
              </div>
            )}
          </div>
        ))}
        {!lines.length && !sent.length && <p className="px-4 py-10 text-center text-sm text-muted">{type === 'dine_in' && !spot ? 'Choose a table, then add dishes.' : 'Tap dishes to add them, or type a name or short code.'}<span className="mt-1 hidden text-xs lg:block">Type 2*BC for two of a dish</span></p>}
      </div>

      {/* Totals and actions stay in place whatever the list length */}
      <div className="shrink-0 border-t border-line pt-2">
        <div className="tabular text-sm">
          {lines.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-x-3 text-[13px] text-muted">
              <span>{count} item{count === 1 ? '' : 's'} {rupee(subtotal)}</span>
              {disc > 0 && <button onClick={() => setDiscount(null)} className="flex items-center gap-1 font-semibold text-good" aria-label="Remove discount">−{rupee(disc)} {discount!.reason}<X size={12} /></button>}
              <span>GST {tax.bps / 100}% {rupee(t.tax)}{t.roundOff !== 0 && ` · round off ${t.roundOff > 0 ? '+' : '−'}${rupee(Math.abs(t.roundOff))}`}</span>
            </div>
          )}
          <div className="flex items-end justify-between gap-2 py-1">
            <span className="font-bold">{lines.length ? (sent.length ? 'This KOT' : 'Total') : sent.length ? 'Table bill' : 'Total'}{lines.length > 0 && sent.length > 0 && <span className="block text-xs font-normal text-muted">Table will be {rupee((tableBill?.duePaise ?? 0) + t.total)}</span>}</span>
            <span className="text-2xl leading-none font-extrabold">{rupee(lines.length ? t.total : sent.length ? tableBill!.duePaise : 0)}</span>
          </div>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-ink-2">
          {canDiscount && lines.length > 0 && !disc && <button onClick={() => setDiscOpen(true)} className="flex items-center gap-1 text-brand-text"><Percent size={13} />Discount</button>}
          {lines.length > 0 && <button onClick={hold} className="flex items-center gap-1"><PauseCircle size={13} />Hold{kbd('F2')}</button>}
          {lines.length > 0 && <button onClick={clearCart} className="flex items-center gap-1 text-bad"><Trash2 size={13} />Clear</button>}
          <span className="ml-auto flex items-center gap-2.5 text-muted" title="Prints on this device"><Printer size={13} /><label className="flex items-center gap-1"><input type="checkbox" checked={prints.kot} onChange={() => flip('kot')} />KOT</label><label className="flex items-center gap-1"><input type="checkbox" checked={prints.bill} onChange={() => flip('bill')} />Bill</label></span>
        </div>
        {type === 'dine_in' ? (
          !lines.length && sent.length ? (
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <a href={`/print/table/${tableBill!.session.id}?print=1`} target="_blank" rel="noopener" className="inline-flex items-center gap-2 rounded-xl border border-line px-4 font-semibold hover:bg-soft"><Printer size={16} />Print bill</a>
              {canSettle ? <Btn tone="good" size="lg" disabled={waiting} onClick={() => setPay('table')}>Settle {rupee(tableBill!.duePaise)}{kbd('F8')}</Btn> : <p className="self-center text-center text-sm text-muted">The cashier settles the bill.</p>}
            </div>
          ) : <Btn tone="dark" size="lg" className="w-full" disabled={!lines.length || !spotId} loading={busy} onClick={() => send()}>Send KOT{spot ? ` · Table ${spot.label}` : ''}{kbd('F4')}</Btn>
        ) : app ? (
          <Btn tone="dark" size="lg" className="w-full" disabled={!lines.length} loading={busy} onClick={() => send()}>Accept & send KOT · paid online</Btn>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Btn tone="outline" size="lg" disabled={!lines.length} loading={busy && !pay} onClick={() => send()}>KOT · pay later{kbd('F4')}</Btn>
            <Btn tone="good" size="lg" disabled={!lines.length || !canSettle} onClick={() => setPay('order')}>KOT & pay{kbd('F8')}</Btn>
          </div>
        )}
      </div>
    </div>
  );

  const tile = (i: MenuItemFull, first: boolean) => {
    const inCart = lines.filter(l => l.itemId === i.id).reduce((a, l) => a + l.qty, 0);
    const on = avail(i);
    return (
      <button key={i.id} onClick={() => { add(i, query.n); if (q) setQ(''); }} disabled={!on}
        className={`relative flex min-h-[76px] flex-col rounded-xl border bg-white p-2.5 text-left transition active:scale-[.98] disabled:opacity-45 ${inCart ? 'border-brand ring-1 ring-brand' : first ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-ink-2'}`}>
        {inCart > 0 && <span className="tabular absolute -top-1.5 -right-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-brand px-1.5 text-xs font-bold text-brand-ink">{inCart}</span>}
        <span className="flex items-start gap-1.5"><span className="mt-[5px] flex shrink-0"><VegMark veg={i.veg} size={11} /></span><span className="text-sm leading-snug font-semibold">{i.name}</span></span>
        <span className="mt-auto flex items-center justify-between gap-1 pt-1 text-[13px]">
          <span className="tabular font-bold text-ink-2">{rupee(fromPrice(i))}{i.variants.length > 0 && '+'}</span>
          {!on ? <Pill tone="bad">Off</Pill> : <span className="flex items-center gap-1 truncate text-[11px] font-semibold text-muted">{i.shortCode && <span className="rounded bg-soft px-1">{i.shortCode}</span>}{hasOptions(i) && !i.shortCode && (i.variants.length ? 'Sizes' : 'Add-ons')}</span>}
        </span>
      </button>
    );
  };

  return (
    <div>
      <div className="grid gap-3 lg:h-[calc(100dvh-24px)] lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_410px]">
        <section className="flex min-h-0 min-w-0 flex-col">
          <div className="mb-2 flex shrink-0 items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-white px-3 focus-within:border-ink">
              <Search size={17} className="shrink-0 text-muted" />
              <input ref={searchRef} value={q} onChange={e => { setQ(e.target.value); if (e.target.value) setPane('menu'); }} placeholder="Dish name or short code  ( / )" aria-label="Search items"
                onKeyDown={e => { if (e.key === 'Enter' && query.term && shown[0]) { add(shown[0], query.n); setQ(''); } if (e.key === 'Escape') { setQ(''); e.currentTarget.blur(); } }}
                className="w-full min-w-0 py-2.5 text-[15px] outline-none" />
              {query.n > 1 && <Pill tone="info">× {query.n}</Pill>}
              {q && <button onClick={() => setQ('')} aria-label="Clear search" className="text-muted"><X size={16} /></button>}
            </label>
            {type === 'dine_in' && <button onClick={() => setPane(p => (p === 'tables' ? 'menu' : 'tables'))} className="flex shrink-0 items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-semibold">{pane === 'tables' ? <><Utensils size={16} />Menu</> : <><Armchair size={16} />Tables{kbd('F9')}</>}</button>}
            {held.length > 0 && <button onClick={() => setHeldOpen(true)} className="flex shrink-0 items-center gap-1.5 rounded-xl border border-[#F5D7A9] bg-[#FFF8EC] px-3 py-2.5 text-sm font-bold text-[#7A4A00]"><PauseCircle size={16} />{held.length} on hold</button>}
          </div>
          {last && (
            <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2 rounded-xl bg-[#E7F6EF] px-3 py-1.5 text-sm text-[#11734E]">
              <b>{last.text}</b>
              <span className="ml-auto flex gap-1">
                {last.kot && <button onClick={() => printQuietly(last.kot!)} className="flex items-center gap-1 rounded-lg px-2 py-1 font-semibold hover:bg-white/60"><Printer size={14} />Print KOT</button>}
                {last.bill && <button onClick={() => printQuietly(`${last.bill}?print=1`)} className="flex items-center gap-1 rounded-lg px-2 py-1 font-semibold hover:bg-white/60"><ReceiptText size={14} />Print bill</button>}
                <button onClick={() => setLast(null)} aria-label="Hide" className="rounded-lg px-1.5 hover:bg-white/60"><X size={14} /></button>
              </span>
            </div>
          )}
          {pane === 'tables' && type === 'dine_in' ? <PosFloor spots={spots} areas={areas} live={live} current={spotId} onPick={pickTable} /> : (
            <div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row">
              <nav aria-label="Categories" className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto lg:w-[140px] lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto">
                {[...(favs ? [{ id: 'fav', name: 'Favourites' }] : []), { id: 'all', name: 'All dishes' }, ...menu.categories].map(c => (
                  <button key={c.id} onClick={() => { setCat(c.id); setQ(''); }} aria-pressed={cat === c.id && !q}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2.5 text-left text-sm font-semibold whitespace-nowrap lg:whitespace-normal ${cat === c.id && !q ? 'bg-ink text-white' : 'bg-white text-ink-2 hover:bg-line'}`}>{c.id === 'fav' && <Star size={14} />}{c.name}</button>
                ))}
              </nav>
              <div className="min-h-0 flex-1 overflow-y-auto pt-1.5 pr-1.5 pb-24 lg:pb-2">
                {groups.map(g => (
                  <div key={g.name || 'x'} className="mb-3">
                    {g.name && <h2 className="mb-1.5 text-sm font-bold text-muted">{g.name}</h2>}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">{g.list.map(i => tile(i, !!query.term && i === shown[0]))}</div>
                  </div>
                ))}
                {!shown.length && <p className="py-10 text-center text-sm text-muted">{q ? `Nothing matches “${q}”.` : cat === 'fav' ? 'No favourites yet. Tick “Favourites” on a dish in Menu.' : 'No dishes in this category.'}</p>}
              </div>
            </div>
          )}
        </section>
        <aside className="hidden min-h-0 rounded-2xl bg-white p-3.5 lg:block">{cart}</aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white p-3 pb-[calc(12px+env(safe-area-inset-bottom))] lg:hidden">
        <Btn tone="dark" size="lg" className="w-full !justify-between" onClick={() => setCartOpen(true)}>
          <span className="truncate">{count ? `${spot && type === 'dine_in' ? `T${spot.label} · ` : ''}${count} item${count === 1 ? '' : 's'} · ${rupee(t.total)}` : type === 'dine_in' ? (spot ? `Table ${spot.label}` : 'Choose a table') : 'Cart is empty'}</span><span>View order →</span>
        </Btn>
      </div>
      <Sheet open={cartOpen && !pay && !opt && !discOpen && !billOpen && !heldOpen} onClose={() => setCartOpen(false)} title="Current order" full>
        <div className="h-full p-4">{cart}</div>
      </Sheet>

      <Sheet open={heldOpen} onClose={() => setHeldOpen(false)} title="Orders on hold">
        <ul className="divide-y divide-line px-4 pb-4">
          {held.map(h => (
            <li key={h.id} className="flex items-center gap-3 py-3">
              <span className="min-w-0 flex-1 text-sm"><b>{label(h)}</b><span className="block truncate text-xs text-muted">{h.lines.map(l => `${l.qty} × ${l.name}`).join(', ')}</span><span className="block text-xs text-muted">{timeAgo(h.at)} · {rupee(h.lines.reduce((a, l) => a + l.unitPaise * l.qty, 0))} before GST</span></span>
              <Btn size="sm" tone="dark" onClick={() => resume(h)}>Continue</Btn>
              <button aria-label={`Remove ${label(h)}`} className="rounded-lg p-2 text-muted hover:bg-soft" onClick={async () => { if (await confirm({ title: 'Remove this held order?', body: 'It was never sent to the kitchen.', confirm: 'Remove', tone: 'danger' })) { const rest = held.filter(x => x.id !== h.id); saveHeld(rest); if (!rest.length) setHeldOpen(false); } }}><Trash2 size={16} /></button>
            </li>
          ))}
          {!held.length && <li className="py-6 text-center text-sm text-muted">Nothing on hold.</li>}
        </ul>
        <p className="px-4 pb-4 text-xs text-muted">Held orders are kept on this device only.</p>
      </Sheet>
      <ItemOptions item={(opt?.item ?? null) as OptItem | null} open={!!opt} onClose={() => setOpt(null)} onAdd={p => opt && add(opt.item, opt.n, p)} />
      <DiscountSheet open={discOpen} onClose={() => setDiscOpen(false)} subtotalPaise={subtotal} current={discount} onApply={d => setDiscount(d)} />
      <PaySheet venueId={venue.id} open={pay === 'order'} onClose={() => setPay(null)} title="Take payment & send KOT" amountPaise={t.total} onPay={p => send(p)} />
      <PaySheet venueId={venue.id} open={pay === 'table' && !!tableBill} onClose={() => setPay(null)} title={tableBill ? `Settle ${tableBill.spotLabel}` : ''} amountPaise={tableBill?.duePaise ?? 0} guests={tableBill?.session.guests} onPay={settleTable} />
      {tableBill && <TableBillSheet bill={billOpen ? tableBill : null} live={live} spots={spots} role={role} onClose={() => setBillOpen(false)} reload={reload} />}
    </div>
  );
}

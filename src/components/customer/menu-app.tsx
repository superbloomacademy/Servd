'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, ChevronRight, Clapperboard, Clock, MapPin, Search, Tag, UserRound, X, ReceiptText, BellRing, GlassWater, Armchair, Store } from 'lucide-react';
import { api, hhmm, rupee, store, useRealtime } from '@/lib/client';
import { brandVars } from '@/lib/theme';
import { Sheet, Spinner, Toggle } from '@/components/ui/kit';
import { useToast } from '@/components/ui/providers';
import { ItemRow, MiniCard } from './item-parts';
import { CartSheet } from './cart-sheet';
import { LoginSheet } from './login-sheet';
import { TableBillSheet } from './table-bill';
import { ACTIVE, hasOpts, lineInfo, lineKey, parseKey, type Item, type OrderView, type ScanData } from './types';
import { ItemOptions, type OptItem } from '@/components/ui/item-options';

export function MenuApp({ code }: { code: string }) {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<ScanData | null>(null);
  const [error, setError] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const [vegOnly, setVegOnly] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [opt, setOpt] = useState<Item | null>(null);
  const [billOpen, setBillOpen] = useState(false);
  const [login, setLogin] = useState<{ then?: () => void; reason?: string } | null>(null);
  const [active, setActive] = useState<OrderView[]>([]);
  const [activeCat, setActiveCat] = useState('');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const venueId = data?.venue.id;

  const load = useCallback(async () => {
    try {
      const d = await api<ScanData>('/api/scan', { body: { code, visitId: store.get(`sv_visit_${code}`, null) } });
      if (d.visit) store.set(`sv_visit_${code}`, d.visit.id);
      store.set('sv_last_code', code);
      setData(d);
      setCart(prev => {
        const saved = Object.keys(prev).length ? prev : store.get<Record<string, number>>(`sv_cart_${d.venue.id}`, {});
        const next: Record<string, number> = {};
        const gone: string[] = [];
        for (const [id, q] of Object.entries(saved)) {
          const it = d.menu.items.find(i => i.id === parseKey(id).itemId);
          if (it?.available && lineInfo(it, id)) next[id] = q; else if (it) gone.push(it.name);
        }
        if (gone.length) toast(`${gone.join(', ')} just sold out and was removed from your cart`, 'bad');
        return next;
      });
      setError('');
    } catch (e) { setError((e as Error).message); }
  }, [code, toast]);

  const loadActive = useCallback(async () => {
    try {
      const r = await api<{ orders: OrderView[] }>('/api/me/orders');
      setActive(r.orders.filter(o => o.venueId === venueId && ACTIVE.includes(o.status)));
    } catch { setActive([]); }
  }, [venueId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (data?.customer && venueId) loadActive(); }, [data?.customer, venueId, loadActive]);
  useEffect(() => { if (venueId) store.set(`sv_cart_${venueId}`, cart); }, [cart, venueId]);

  // Live: items going on/off, our active orders changing, the table bill changing.
  useRealtime([venueId ? `menu:${venueId}` : '', ...active.map(o => `order:${o.id}`), data?.tableSessionId && data.customer ? `table:${data.tableSessionId}` : ''], {
    menu: () => load(),
    order: () => loadActive(),
  });

  const catName = useMemo(() => Object.fromEntries((data?.menu.categories || []).map(c => [c.id, c.name])), [data]);
  const visibleItems = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.menu.items.filter(i => (!vegOnly || i.veg) && (!q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || (catName[i.categoryId] || '').toLowerCase().includes(q)));
  }, [data, query, vegOnly, catName]);
  const sections = useMemo(() => (data?.menu.categories || [])
    .map(c => ({ ...c, items: visibleItems.filter(i => i.categoryId === c.id) })).filter(c => c.items.length), [data, visibleItems]);

  // Highlight the category in view (for the Menu button list).
  useEffect(() => {
    const obs = new IntersectionObserver(es => { const v = es.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setActiveCat(v.target.id.replace('cat-', '')); }, { rootMargin: '-120px 0px -60% 0px' });
    Object.values(sectionRefs.current).forEach(el => el && obs.observe(el));
    return () => obs.disconnect();
  }, [sections]);

  if (error) return <Notice title="We couldn’t open this menu" text={error} />;
  if (!data) return <div className="grid min-h-dvh place-items-center"><Spinner size={28} className="text-muted" /></div>;

  const { vendor, venue, spot, window: win } = data;
  const canOrder = win.open && !!data.visit;
  const setQty = (id: string, q: number) => setCart(c => { const n = { ...c }; if (q > 0) n[id] = Math.min(30, q); else delete n[id]; return n; });
  const keysOf = (it: Item) => Object.keys(cart).filter(k => parseKey(k).itemId === it.id);
  // Items with sizes / add-ons open the options sheet; "−" takes off the last one added.
  const ctl = (it: Item) => hasOpts(it)
    ? { qty: keysOf(it).reduce((a, k) => a + cart[k], 0), onAdd: () => setOpt(it), onInc: () => setOpt(it), onDec: () => { const k = keysOf(it).pop(); if (k) setQty(k, cart[k] - 1); } }
    : { qty: cart[it.id] || 0, onAdd: () => setQty(it.id, 1), onInc: () => setQty(it.id, (cart[it.id] || 0) + 1), onDec: () => setQty(it.id, (cart[it.id] || 0) - 1) };
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const cartTotal = Object.entries(cart).reduce((s, [k, q]) => { const it = data.menu.items.find(i => i.id === parseKey(k).itemId); const inf = it && lineInfo(it, k); return s + (inf ? inf.unitPaise : 0) * q; }, 0);
  const popular = data.mostOrdered.map(id => data.menu.items.find(i => i.id === id)).filter((i): i is Item => !!i && i.available && (!vegOnly || i.veg)).slice(0, 8);
  const spotText = spot.kind === 'seat' ? `${spot.areaName} · Seat ${spot.label}` : spot.kind === 'table' ? `Table ${spot.label}` : spot.kind === 'shop' ? 'Order at the counter' : spot.label;
  const SpotIcon = spot.kind === 'seat' ? Armchair : spot.kind === 'table' ? MapPin : Store;
  const jump = (id: string) => { setMenuOpen(false); setQuery(''); setTimeout(() => sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); };
  const needLogin = (then: () => void, reason?: string) => data.customer ? then() : setLogin({ then, reason });
  const callStaff = (kind: 'waiter' | 'water') => needLogin(async () => {
    try { await api('/api/requests', { body: { visitId: data.visit?.id, kind } }); toast(kind === 'waiter' ? 'A waiter is on the way' : 'Water is on the way'); }
    catch (e) { toast((e as Error).message, 'bad'); }
  });

  return (
    <div style={brandVars(vendor.brandColor)} className="mx-auto min-h-dvh max-w-[560px] bg-white pb-36">
      {/* Venue header */}
      <header className="px-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {vendor.logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={vendor.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl border border-line object-cover" />
              : <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand text-lg font-extrabold text-brand-ink">{vendor.name.slice(0, 1)}</div>}
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-[22px] leading-tight font-extrabold"><span className="truncate">{vendor.name}</span>{vendor.isDemo && <span className="shrink-0 rounded-md border border-dashed border-[#9A5500] bg-[#FFF3E0] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-[#9A5500] uppercase" title="Sample venue for demonstrations">Demo</span>}</h1>
              <p className="truncate text-[13px] text-muted">{venue.name}</p>
            </div>
          </div>
          <Link href="/account" aria-label="My account" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line text-ink-2 hover:bg-soft"><UserRound size={19} /></Link>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 font-semibold text-brand-text"><SpotIcon size={14} />{spotText}</span>
          {win.show && <span className="inline-flex items-center gap-1.5 rounded-full bg-soft px-3 py-1.5 font-medium text-ink-2"><Clapperboard size={14} />{win.show.movie} · {hhmm(win.show.time)} show</span>}
          {win.show && win.show.minutesToInterval > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-soft px-3 py-1.5 font-medium text-ink-2"><Clock size={14} />Interval in {win.show.minutesToInterval} min</span>}
        </div>

        {!canOrder && (
          <div className="mt-4 rounded-2xl border border-[#F5D7A9] bg-[#FFF8EC] px-4 py-3 text-sm text-[#7A4A00]">
            <b className="block">Ordering is closed right now</b>{win.reason || 'Scan the QR code at your seat or table again.'}
          </div>
        )}

        {/* Active orders & running bill */}
        {active.map(o => (
          <Link key={o.id} href={`/o/${o.id}`} className="mt-3 flex items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-white">
            <div className="tabular rounded-lg bg-white/15 px-2 py-1 text-sm font-extrabold">KOT {o.kotNo}</div>
            <div className="min-w-0 flex-1 text-sm"><b>{statusLine(o)}</b><div className="truncate text-white/70">{o.items.map(i => `${i.qty}× ${i.name}`).join(', ')}</div></div>
            <ChevronRight size={18} />
          </Link>
        ))}
        {data.tableSessionId && data.customer && venue.serviceMode === 'table_bill' && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button onClick={() => setBillOpen(true)} className="flex flex-col items-center gap-1 rounded-2xl border border-line py-3 text-xs font-semibold text-ink-2 hover:bg-soft"><ReceiptText size={19} className="text-brand-text" />Table bill</button>
            <button onClick={() => callStaff('waiter')} className="flex flex-col items-center gap-1 rounded-2xl border border-line py-3 text-xs font-semibold text-ink-2 hover:bg-soft"><BellRing size={19} className="text-brand-text" />Call waiter</button>
            <button onClick={() => callStaff('water')} className="flex flex-col items-center gap-1 rounded-2xl border border-line py-3 text-xs font-semibold text-ink-2 hover:bg-soft"><GlassWater size={19} className="text-brand-text" />Ask for water</button>
          </div>
        )}
      </header>

      {/* Search + veg */}
      <div className="sticky top-0 z-20 mt-4 flex items-center gap-3 border-b border-line bg-white/95 px-4 py-3 backdrop-blur">
        <label className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5 shadow-[0_1px_4px_rgba(0,0,0,0.04)] focus-within:border-ink">
          <Search size={18} className="text-brand-text" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search for dishes" aria-label="Search the menu" className="w-full text-[15px] outline-none placeholder:text-faint" />
          {query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={16} className="text-muted" /></button>}
        </label>
        <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-2"><span>Veg</span><Toggle on={vegOnly} onChange={() => setVegOnly(v => !v)} label="Veg only" /></div>
      </div>

      {/* Offers */}
      {!query && data.offers.length > 0 && (
        <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pt-4">
          {data.offers.map(o => (
            <div key={o.code} className="flex w-[250px] shrink-0 items-center gap-3 rounded-2xl border border-line p-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-text"><Tag size={18} /></div>
              <div className="min-w-0"><p className="text-sm leading-snug font-bold">{o.type === 'flat' ? `Flat ${rupee(o.value)} off` : `${o.value}% off`}</p>
                <p className="truncate text-xs text-muted">Use {o.code}{o.minOrderPaise ? ` · above ${rupee(o.minOrderPaise)}` : ''}</p></div>
            </div>
          ))}
        </div>
      )}

      {/* Most ordered */}
      {!query && popular.length >= 3 && (
        <section className="pt-6">
          <h2 className="px-4 text-lg font-extrabold">Most ordered here</h2>
          <div className="no-scrollbar mt-3 flex gap-4 overflow-x-auto px-4 pb-2">
            {popular.map(it => <MiniCard key={it.id} item={it} category={catName[it.categoryId]} canOrder={canOrder} {...ctl(it)} />)}
          </div>
        </section>
      )}

      {/* Menu */}
      <div className="px-4">
        {sections.map(sec => (
          <section key={sec.id} id={`cat-${sec.id}`} ref={el => { sectionRefs.current[sec.id] = el; }} className="scroll-mt-20 pt-6">
            <h2 className="flex items-baseline gap-2 text-lg font-extrabold">{sec.name}<span className="text-sm font-semibold text-faint">({sec.items.length})</span></h2>
            <div className="divide-y divide-dashed divide-line">
              {sec.items.map(it => <ItemRow key={it.id} item={it} category={sec.name} canOrder={canOrder} {...ctl(it)} />)}
            </div>
          </section>
        ))}
        {!sections.length && <Notice title="No dishes match" text={vegOnly ? 'Try turning off Veg only.' : 'Try a different search.'} inline />}
      </div>

      <footer className="mt-10 border-t-8 border-soft px-4 py-6 text-xs leading-relaxed text-faint">
        <p className="font-semibold text-muted">{vendor.legalName || vendor.name}</p>
        {vendor.address && <p>{vendor.address}</p>}
        {vendor.fssai && <p>FSSAI Lic. No. {vendor.fssai}</p>}
        <p className="mt-3">Powered by <b>servd</b></p>
      </footer>

      {/* Floating Menu button + cart bar */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[560px] px-4 pb-[calc(14px+env(safe-area-inset-bottom))]">
        <div className="flex justify-end">
          <button onClick={() => setMenuOpen(true)} className="pointer-events-auto mb-3 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-bold text-white shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
            <BookOpen size={17} /> Menu
          </button>
        </div>
        {cartCount > 0 && canOrder && (
          <button onClick={() => setCartOpen(true)} className="anim-pop pointer-events-auto flex w-full items-center justify-between rounded-2xl bg-brand px-4 py-3.5 text-brand-ink shadow-[0_10px_30px_rgba(0,0,0,0.22)]">
            <span className="text-left text-sm leading-tight"><b className="block text-[15px]">{cartCount} item{cartCount > 1 ? 's' : ''} added</b><span className="tabular opacity-90">{rupee(cartTotal)} plus taxes</span></span>
            <span className="flex items-center gap-1 text-[15px] font-bold">View cart <ChevronRight size={18} /></span>
          </button>
        )}
      </div>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu">
        <ul className="py-2">
          {sections.map(sec => (
            <li key={sec.id}>
              <button onClick={() => jump(sec.id)} className={`flex w-full items-center justify-between px-5 py-3 text-left text-[15px] hover:bg-soft ${activeCat === sec.id ? 'font-extrabold text-brand-text' : 'font-medium text-ink'}`}>
                <span>{sec.name}</span><span className="tabular text-sm text-muted">{sec.items.length}</span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <ItemOptions item={opt as OptItem | null} open={!!opt} onClose={() => setOpt(null)} cta="Add to cart"
        onAdd={pk => { if (!opt) return; const k = lineKey(opt.id, pk.variantId, pk.addonIds); setQty(k, (cart[k] || 0) + pk.qty); }} />
      <CartSheet open={cartOpen} onClose={() => setCartOpen(false)} data={data} cart={cart} setQty={setQty} catName={catName}
        onNeedLogin={then => setLogin({ then, reason: 'Log in to place your order. We use your number to send you the order status and to keep your orders safe.' })}
        onPlaced={o => { setCart({}); store.set(`sv_cart_${venue.id}`, {}); setCartOpen(false); router.push(`/o/${o.id}`); }}
        onRescan={() => { setCartOpen(false); load(); }} />

      {data.tableSessionId && <TableBillSheet open={billOpen} onClose={() => setBillOpen(false)} tableSessionId={data.tableSessionId} venue={venue} />}

      <LoginSheet open={!!login} onClose={() => setLogin(null)} reason={login?.reason}
        onDone={async c => { const t = login?.then; setLogin(null); setData(d => d && { ...d, customer: c }); await load(); toast('Logged in'); t?.(); }} />
    </div>
  );
}

function statusLine(o: OrderView) {
  if (o.awaitingStaff) return 'Waiting for the staff to accept';
  if (o.status === 'awaiting_payment') return o.payMethod === 'cash' ? `Pay ${rupee(o.totalPaise)} at the counter` : o.payStatus === 'claimed' ? 'Waiting for payment confirmation' : `Pay ${rupee(o.totalPaise)} to confirm`;
  return ({ confirmed: 'Order confirmed', preparing: 'Being prepared', ready: o.fulfilment === 'pickup' ? 'Ready, collect at the counter' : 'Ready', out: 'On the way to you' } as Record<string, string>)[o.status] || 'In progress';
}

function Notice({ title, text, inline }: { title: string; text: string; inline?: boolean }) {
  return (
    <div className={`mx-auto flex max-w-sm flex-col items-center px-6 text-center ${inline ? 'py-12' : 'min-h-dvh justify-center'}`}>
      <p className="text-lg font-bold">{title}</p>
      <p className="mt-2 text-sm text-muted">{text}</p>
    </div>
  );
}

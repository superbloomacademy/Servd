'use client';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, ListOrdered, ChefHat, Armchair, Footprints, BookOpenText, QrCode, BadgePercent, Users, Settings, MessageCircleQuestion, History, LogOut, Volume2, VolumeX, Pause, Play, Rocket, ReceiptText, Calculator, BarChart3, Wallet, Boxes, Contact,
} from 'lucide-react';
import { api, store, useRealtime } from '@/lib/client';
import { brandVars } from '@/lib/theme';
import { Spinner } from '@/components/ui/kit';
import { useConfirm, useToast } from '@/components/ui/providers';
import { needsAccept, type Live, type Me, type Order, type Role, type VenueCtx } from './types';
import { LiveBoard } from './live-board';
import { Kitchen } from './kitchen';
import { Tables } from './tables';
import { Runner } from './runner';
import { MenuManager } from './menu-manager';
import { SpotsQr } from './spots-qr';
import { Dashboard } from './dashboard';
import { Coupons } from './coupons';
import { Team } from './team';
import { VenueSettings } from './settings';
import { Support } from './support';
import { Activity } from './activity';
import { GetStarted } from './get-started';
import { GstBills } from './gst-bills';
import { Pos } from './pos';
import { Reports } from './reports';
import { CashDrawer } from './cash-drawer';
import { Inventory } from './inventory';
import { Customers } from './customers';

type Tab = 'setup' | 'gst' | 'dashboard' | 'pos' | 'reports' | 'cash' | 'inventory' | 'customers' | 'live' | 'kitchen' | 'tables' | 'runner' | 'menu' | 'qr' | 'coupons' | 'team' | 'settings' | 'support' | 'activity';
const NAV: { key: Tab; label: string; icon: React.ComponentType<{ size?: number }>; roles: Role[]; modes?: string[]; feature?: 'pos' | 'inventory' | 'customers'; group?: string }[] = [
  { key: 'setup', label: 'Get started', icon: Rocket, roles: ['owner', 'manager'] },
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['owner', 'manager'] },
  { key: 'pos', label: 'Billing', icon: Calculator, roles: ['owner', 'manager', 'cashier', 'captain'], feature: 'pos', group: 'Service' },
  { key: 'tables', label: 'Tables', icon: Armchair, roles: ['owner', 'manager', 'cashier', 'captain'], modes: ['table_bill', 'table_prepay'], group: 'Service' },
  { key: 'live', label: 'Orders & payments', icon: ListOrdered, roles: ['owner', 'manager', 'cashier', 'captain'], group: 'Service' },
  { key: 'kitchen', label: 'Kitchen (KOT)', icon: ChefHat, roles: ['owner', 'manager', 'cashier', 'station'], group: 'Service' },
  { key: 'runner', label: 'Seat delivery', icon: Footprints, roles: ['owner', 'manager', 'runner', 'captain'], modes: ['seat_delivery'], group: 'Service' },
  { key: 'menu', label: 'Menu', icon: BookOpenText, roles: ['owner', 'manager'], group: 'Menu & stock' },
  { key: 'inventory', label: 'Inventory', icon: Boxes, roles: ['owner', 'manager'], feature: 'inventory', group: 'Menu & stock' },
  { key: 'qr', label: 'QR codes', icon: QrCode, roles: ['owner', 'manager'], group: 'Menu & stock' },
  { key: 'coupons', label: 'Coupons', icon: BadgePercent, roles: ['owner', 'manager'], group: 'Menu & stock' },
  { key: 'reports', label: 'Day-end reports', icon: BarChart3, roles: ['owner', 'manager', 'cashier'], group: 'Money' },
  { key: 'cash', label: 'Cash drawer', icon: Wallet, roles: ['owner', 'manager', 'cashier'], feature: 'pos', group: 'Money' },
  { key: 'gst', label: 'GST bills', icon: ReceiptText, roles: ['owner', 'manager'], group: 'Money' },
  { key: 'customers', label: 'Customers', icon: Contact, roles: ['owner', 'manager'], feature: 'customers', group: 'Business' },
  { key: 'support', label: 'Customer help', icon: MessageCircleQuestion, roles: ['owner', 'manager'], group: 'Business' },
  { key: 'team', label: 'Staff logins', icon: Users, roles: ['owner'], group: 'Business' },
  { key: 'settings', label: 'Settings & brand', icon: Settings, roles: ['owner'], group: 'Business' },
  { key: 'activity', label: 'Activity log', icon: History, roles: ['owner', 'manager'], group: 'Business' },
];
const HOME: Record<Role, Tab> = { super_admin: 'dashboard', owner: 'dashboard', manager: 'live', cashier: 'pos', station: 'kitchen', captain: 'tables', runner: 'runner' };

export function StaffShell() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [me, setMe] = useState<Me | null>(null);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [live, setLive] = useState<Live>({ orders: [], tables: [], requests: [] });
  const [connected, setConnected] = useState(false);
  const [sound, setSound] = useState(true);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const [presetSpot, setPresetSpot] = useState<string | null>(null);
  const clearPreset = useCallback(() => setPresetSpot(null), []);
  // Phones: the strip of screens scrolls sideways, so bring the open one into view.
  const activeNav = useRef<HTMLButtonElement>(null);
  useEffect(() => { activeNav.current?.scrollIntoView({ block: 'nearest', inline: 'center' }); }, [tab]);
  const refetch = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api<Me>('/api/staff/me').then(m => {
      if (m.staff.role === 'super_admin' && !store.get('sv_admin_venue', null)) { router.replace('/admin'); return; }
      setMe(m);
      const saved = store.get<string | null>('sv_staff_venue', null) || store.get<string | null>('sv_admin_venue', null);
      const v = m.venues.find(x => x.id === saved) || m.venues[0];
      setVenueId(v?.id ?? null);
      setSound(store.get('sv_sound', true));
    }).catch(() => router.replace('/staff/login'));
  }, [router]);

  const venue: VenueCtx | null = useMemo(() => {
    const v = me?.venues.find(x => x.id === venueId);
    return v ? { id: v.id, name: v.name, type: v.type, serviceMode: v.serviceMode, vendorId: v.vendorId, brandColor: v.vendor.brandColor } : null;
  }, [me, venueId]);
  const role: Role = me?.staff.role === 'super_admin' ? 'owner' : (me?.staff.role ?? 'cashier');
  // "Get started" shows while the vendor is still setting up.
  const settingUp = me?.venues.find(x => x.id === venueId)?.vendor.stage === 'setup';
  const features = me?.venues.find(x => x.id === venueId)?.vendor.features;
  const nav = NAV.filter(n => n.roles.includes(role) && (!n.modes || (venue && n.modes.includes(venue.serviceMode))) && (n.key !== 'setup' || settingUp)
    && (!n.feature || !features || features[n.feature]));

  useEffect(() => {
    if (!me || !venue) return;
    const saved = store.get<Tab | null>(`sv_tab_${role}`, null);
    const home: Tab = settingUp && nav.some(n => n.key === 'setup') ? 'setup' : HOME[role];
    setTab(t => (t && nav.some(n => n.key === t) ? t : !settingUp && saved && nav.some(n => n.key === saved) ? saved : nav.some(n => n.key === home) ? home : nav.some(n => n.key === 'pos') ? 'pos' : nav[0]?.key ?? 'live'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, venue?.id]);

  const loadLive = useCallback(async () => {
    if (!venueId) return;
    try { setLive({ ...(await api<Live>(`/api/staff/v/${venueId}/live`)), venueId }); } catch { /* keep */ }
  }, [venueId]);
  const loadOpen = useCallback(async () => {
    if (!venueId) return;
    try { const r = await api(`/api/staff/v/${venueId}/settings`); setIsOpen(r.venue.isOpen); } catch { /* */ }
  }, [venueId]);
  useEffect(() => { loadLive(); loadOpen(); }, [loadLive, loadOpen]);
  useEffect(() => { const t = setInterval(loadLive, 60000); return () => clearInterval(t); }, [loadLive]);
  const soon = useCallback(() => { if (refetch.current) clearTimeout(refetch.current); refetch.current = setTimeout(loadLive, 250); }, [loadLive]);

  const myStation = me?.staff.role === 'station' ? me.staff.stationId : null;
  useRealtime(venueId ? [myStation ? `station:${myStation}` : `venue:${venueId}`] : [], {
    order: (m: { kind: string; order: Order }) => {
      setLive(l => {
        const i = l.orders.findIndex(o => o.id === m.order.id);
        const orders = i >= 0 ? l.orders.map(o => (o.id === m.order.id ? m.order : o)) : [m.order, ...l.orders];
        return { ...l, orders };
      });
      // An order typed in at the counter is news to the kitchen, not to the person on the billing screen.
      const relevant = myStation ? m.order.kots.some(k => k.stationId === myStation && k.status === 'new') : !(tab === 'pos' && m.kind === 'new' && m.order.channel !== 'qr');
      if ((m.kind === 'new' || m.kind === 'payment_claim') && relevant) {
        setFlash(f => new Set(f).add(m.order.id));
        setTimeout(() => setFlash(f => { const n = new Set(f); n.delete(m.order.id); return n; }), 8000);
        if (sound) chime(m.kind === 'payment_claim' ? 2 : 1);
        toast(m.kind === 'payment_claim' ? `KOT ${m.order.kotNo}: customer says they paid. Check and confirm.` : needsAccept(m.order) ? `${m.order.spotLabel}: first QR order. Check the table and accept it.` : `New order · KOT ${m.order.kotNo} · ${m.order.spotLabel}`);
      }
    },
    table: () => soon(),
    request: () => { soon(); if (sound) chime(1); },
    menu: () => {},
  }, setConnected);

  if (!me || !venue || !tab) return <div className="grid min-h-dvh place-items-center"><Spinner size={28} className="text-muted" /></div>;

  const go = (t: Tab) => { setTab(t); store.set(`sv_tab_${role}`, t); };
  const toggleOpen = async () => {
    const next = !isOpen;
    const ok = await confirm({
      title: next ? 'Start taking orders again?' : 'Pause all new orders?',
      body: next ? 'Customers can order from every QR code again.' : 'Customers will see “not taking orders right now”. Orders already placed continue as normal.',
      confirm: next ? 'Start orders' : 'Pause orders', tone: next ? 'primary' : 'danger',
    });
    if (!ok) return;
    try { await api(`/api/staff/v/${venue.id}/settings`, { method: 'PATCH', body: { isOpen: next } }); setIsOpen(next); toast(next ? 'Taking orders' : 'New orders paused'); }
    catch (e) { toast((e as Error).message, 'bad'); }
  };
  const logout = async () => { await api('/api/staff/logout', { body: {} }); router.replace('/staff/login'); };
  const pending = live.orders.filter(o => (o.status === 'awaiting_payment' && o.payStatus !== 'unpaid') || needsAccept(o)).length + live.requests.length;
  const v = me.venues.find(x => x.id === venue.id)!;
  // Billing needs the width: the side menu becomes a narrow strip of icons there.
  const slim = tab === 'pos';
  const hideSlim = slim ? 'lg:hidden' : '';

  return (
    <div style={brandVars(venue.brandColor)} className={`min-h-dvh bg-soft lg:grid ${slim ? 'lg:grid-cols-[68px_1fr]' : 'lg:grid-cols-[248px_1fr]'}`}>
      {/* Side menu: the list of screens scrolls on its own, so the controls at the bottom are always reachable on short screens. */}
      <aside className="border-b border-line bg-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-b-0">
        <div className={`flex shrink-0 items-center gap-3 px-4 py-3 lg:py-4 ${slim ? 'lg:flex-col lg:gap-1.5 lg:px-2 lg:py-3' : ''}`}>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand font-extrabold text-brand-ink">{v.vendor.name.slice(0, 1)}</div>
          {v.vendor.isDemo && slim && <b className="hidden rounded border border-dashed border-[#9A5500] bg-[#FFF8EC] px-1 text-[10px] tracking-wide text-[#7A4A00] uppercase lg:block">Demo</b>}
          <div className={`min-w-0 flex-1 ${hideSlim}`}>
            <p className="truncate font-bold">{v.vendor.name}</p>
            {me.venues.length > 1 ? (
              <select aria-label="Venue" value={venue.id} onChange={e => { setVenueId(e.target.value); store.set('sv_staff_venue', e.target.value); }} className="w-full truncate bg-transparent text-xs text-muted outline-none">
                {me.venues.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            ) : <p className="truncate text-xs text-muted">{venue.name}</p>}
          </div>
          {/* Phones: the same controls as the bottom of the side menu, in the header. */}
          {['owner', 'manager'].includes(role) && isOpen !== null && (
            <button onClick={toggleOpen} className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold lg:hidden ${isOpen ? 'bg-[#E7F6EF] text-[#11734E]' : 'bg-[#FDECEE] text-[#B42334]'}`}
              aria-label={isOpen ? 'Taking orders. Tap to pause' : 'Orders paused. Tap to start'}>
              {isOpen ? <Pause size={13} /> : <Play size={13} />}{isOpen ? 'Open' : 'Paused'}
            </button>
          )}
          <button onClick={() => { setSound(s => !s); store.set('sv_sound', !sound); }} className="relative rounded-lg p-2 text-muted hover:bg-soft lg:hidden" aria-label={sound ? 'Sound on. Tap to mute' : 'Sound off. Tap to turn on'}>
            {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
            <span className={`absolute top-1.5 right-1.5 h-2 w-2 rounded-full ring-2 ring-white ${connected ? 'bg-good' : 'bg-faint'}`} title={connected ? 'Live' : 'Reconnecting'} />
          </button>
          <button onClick={logout} className="rounded-lg p-2 text-muted hover:bg-soft lg:hidden" aria-label="Log out"><LogOut size={18} /></button>
        </div>
        <nav className="no-scrollbar side-scroll flex gap-1 overflow-x-auto px-3 pb-3 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto">
          {nav.map((n, i) => (<Fragment key={n.key}>
            {nav.length > 8 && !slim && n.group && n.group !== nav[i - 1]?.group && <p className="hidden px-3 pt-2.5 pb-0.5 text-[11px] font-bold tracking-wide text-faint uppercase lg:block">{n.group}</p>}
            <button ref={tab === n.key ? activeNav : undefined} onClick={() => go(n.key)} aria-current={tab === n.key ? 'page' : undefined} title={slim ? n.label : undefined}
              className={`relative flex shrink-0 ${slim ? 'lg:justify-center lg:px-0' : ''} items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition ${slim ? '' : 'lg:py-[7px]'} ${tab === n.key ? 'bg-ink text-white' : 'text-ink-2 hover:bg-soft'}`}>
              <n.icon size={18} /><span className={slim ? 'lg:sr-only' : ''}>{n.label}</span>
              {n.key === 'live' && pending > 0 && <span className={`ml-auto rounded-full bg-bad px-1.5 text-[11px] font-bold text-white ${slim ? 'lg:absolute lg:top-0.5 lg:right-0.5' : ''}`}>{pending}</span>}
            </button>
          </Fragment>))}
        </nav>
        <div className={`hidden shrink-0 space-y-2 border-t border-line text-sm lg:block ${slim ? 'p-2' : 'p-3'}`}>
          {me.staff.role === 'super_admin' && <a href="/admin" onClick={() => store.del('sv_admin_venue')} title="Back to super admin" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 font-semibold text-ink-2 hover:bg-soft">←{!slim && ' Back to super admin'}</a>}
          {['owner', 'manager'].includes(role) && isOpen !== null && (
            <button onClick={toggleOpen} title={isOpen ? 'Taking orders' : 'Orders paused'} aria-label={isOpen ? 'Taking orders. Click to pause' : 'Orders paused. Click to start'} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 font-semibold ${slim ? 'justify-center' : ''} ${isOpen ? 'bg-[#E7F6EF] text-[#11734E]' : 'bg-[#FDECEE] text-[#B42334]'}`}>
              {isOpen ? <Pause size={16} /> : <Play size={16} />}{!slim && (isOpen ? 'Taking orders' : 'Orders paused')}
            </button>
          )}
          <div className={`flex items-center gap-1 ${slim ? 'flex-col' : ''}`}>
            <p className="flex min-w-0 flex-1 items-center gap-2 px-2 text-xs text-muted" title={me.staff.name}><span className={`h-2 w-2 shrink-0 rounded-full ${connected ? 'bg-good' : 'bg-faint'}`} /><span className={slim ? 'sr-only' : 'truncate'}>{connected ? 'Live' : 'Reconnecting…'} · {me.staff.name}</span></p>
            <button onClick={() => { setSound(s => !s); store.set('sv_sound', !sound); }} className="rounded-lg p-2 text-muted hover:bg-soft" aria-label={sound ? 'Sound on. Click to mute' : 'Sound off. Click to turn on'} title={sound ? 'Sound on' : 'Sound off'}>
              {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
            </button>
            <button onClick={logout} className="rounded-lg p-2 text-muted hover:bg-soft" aria-label="Log out" title="Log out"><LogOut size={17} /></button>
          </div>
        </div>
      </aside>

      <main className={`min-w-0 px-4 ${slim ? 'py-3 lg:px-3' : 'py-5 sm:px-6 lg:py-7'}`}>
        {v.vendor.isDemo && (
          <p className={`${slim ? 'lg:hidden' : ''} mb-4 rounded-xl border border-dashed border-[#E8C08A] bg-[#FFF8EC] px-3.5 py-2 text-[13px] text-[#7A4A00]`}>
            <b className="mr-1.5 rounded border border-dashed border-[#9A5500] px-1 text-[11px] tracking-wide uppercase">Demo</b>Sample venue with sample data, for showing how Servd works. Orders and bills here are not real.
          </p>
        )}
        {tab === 'setup' && <GetStarted venue={venue} isOwner={role === 'owner'} onLive={() => api<Me>('/api/staff/me').then(setMe)}
          go={t => { if (nav.some(n => n.key === t)) go(t as Tab); else toast('Ask the owner to do this step.', 'bad'); }} />}
        {tab === 'gst' && <GstBills venue={venue} isOwner={role === 'owner'} />}
        {tab === 'dashboard' && <Dashboard venue={venue} />}
        {tab === 'live' && <LiveBoard venue={venue} live={live} role={role} flash={flash} reload={loadLive} />}
        {tab === 'kitchen' && <Kitchen venue={venue} live={live} role={role} myStation={myStation} flash={flash} reload={loadLive} />}
        {tab === 'tables' && <Tables venue={venue} live={live} role={role} reload={loadLive} onOrder={sid => { if (!nav.some(n => n.key === 'pos')) { toast('Taking orders from this screen needs the Billing module.', 'bad'); return; } setPresetSpot(sid); go('pos'); }} />}
        {tab === 'pos' && <Pos key={venue.id} venue={venue} live={live} role={role} presetSpot={presetSpot} clearPreset={clearPreset} reload={loadLive} />}
        {tab === 'reports' && <Reports venue={venue} />}
        {tab === 'cash' && <CashDrawer venue={venue} />}
        {tab === 'inventory' && <Inventory venue={venue} />}
        {tab === 'customers' && <Customers venue={venue} />}
        {tab === 'runner' && <Runner venue={venue} live={live} reload={loadLive} />}
        {tab === 'menu' && <MenuManager venue={venue} />}
        {tab === 'qr' && <SpotsQr venue={venue} />}
        {tab === 'coupons' && <Coupons venue={venue} />}
        {tab === 'team' && <Team venue={venue} venues={me.venues} />}
        {tab === 'settings' && <VenueSettings venue={venue} onSaved={() => api<Me>('/api/staff/me').then(setMe)} />}
        {tab === 'support' && <Support venue={venue} />}
        {tab === 'activity' && <Activity venue={venue} />}
      </main>
    </div>
  );
}

function chime(times: number) {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    for (let k = 0; k < times; k++) [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + k * 0.5 + i * 0.16;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.start(t); o.stop(t + 0.32);
    });
  } catch { /* audio blocked until the page is clicked */ }
}

export function PageHead({ title, sub, right }: { title: string; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-extrabold">{title}</h1>{sub && <p className="mt-1 max-w-2xl text-sm text-muted">{sub}</p>}</div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

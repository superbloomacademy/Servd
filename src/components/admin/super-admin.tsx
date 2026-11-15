'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity as ActivityIcon, BadgeIndianRupee, Building2, Headset, LayoutDashboard, LogOut, Plus, Target, Users } from 'lucide-react';
import { api, store } from '@/lib/client';
import { brandVars } from '@/lib/theme';
import { Spinner } from '@/components/ui/kit';
import { Overview } from './overview';
import { Leads } from './leads';
import { Vendors } from './vendors';
import { VendorDetail } from './vendor-detail';
import { Onboard, type OnboardPrefill } from './onboard';
import { Billing } from './billing';
import { Customers } from './customers';
import { SupportDesk } from './support';
import { ActivityLog } from './activity';

export type Tab = 'overview' | 'leads' | 'vendors' | 'onboard' | 'billing' | 'customers' | 'support' | 'activity';
export type Nav = { go: (tab: Tab, opts?: { vendor?: string | null; prefill?: OnboardPrefill }) => void; openVenue: (venueId: string) => void };

const NAV: { key: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'leads', label: 'Leads', icon: Target },
  { key: 'vendors', label: 'Vendors', icon: Building2 },
  { key: 'billing', label: 'Billing', icon: BadgeIndianRupee },
  { key: 'customers', label: 'Customers', icon: Users },
  { key: 'support', label: 'Support', icon: Headset },
  { key: 'activity', label: 'Activity log', icon: ActivityIcon },
];
const TABS = new Set<Tab>(['overview', 'leads', 'vendors', 'onboard', 'billing', 'customers', 'support', 'activity']);

// Super admin console (us, the platform): sales pipeline, vendors, onboarding, billing, customers, support.
// The current screen lives in the URL (?tab=…&vendor=…) so refresh and the back button work.
export function SuperAdmin() {
  const router = useRouter();
  const [me, setMe] = useState<{ name: string } | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [vendor, setVendor] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<OnboardPrefill | undefined>(undefined);
  const [nonce, setNonce] = useState(0);   // fresh screen state on every navigation

  const readUrl = useCallback(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get('tab') as Tab;
    setTab(TABS.has(t) ? t : 'overview');
    setVendor(p.get('vendor'));
  }, []);

  useEffect(() => {
    api<{ staff: { name: string; role: string } }>('/api/staff/me').then(m => {
      if (m.staff.role !== 'super_admin') { router.replace('/staff'); return; }
      setMe(m.staff); readUrl();
    }).catch(() => router.replace('/staff/login'));
    window.addEventListener('popstate', readUrl);
    return () => window.removeEventListener('popstate', readUrl);
  }, [router, readUrl]);

  const go: Nav['go'] = (t, opts) => {
    const v = opts?.vendor ?? null;
    setTab(t); setVendor(v); setPrefill(opts?.prefill); setNonce(n => n + 1);
    const q = new URLSearchParams({ tab: t, ...(v ? { vendor: v } : {}) });
    window.history.pushState(null, '', `/admin?${q}`);
    window.scrollTo(0, 0);
  };
  const openVenue = (venueId: string) => { store.set('sv_admin_venue', venueId); store.set('sv_staff_venue', venueId); router.push('/staff'); };
  const logout = async () => { await api('/api/staff/logout', { body: {} }); store.del('sv_admin_venue'); router.replace('/staff/login'); };
  const nav: Nav = { go, openVenue };

  if (!me) return <div className="grid min-h-dvh place-items-center bg-soft"><Spinner size={28} className="text-muted" /></div>;
  const active = tab === 'onboard' ? 'vendors' : tab;

  return (
    <div style={brandVars('#E23744')} className="min-h-dvh bg-soft lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-line bg-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-3 px-5 py-3 lg:py-5">
          <div>
            <div className="text-[22px] leading-none font-extrabold" style={{ fontFamily: 'var(--font-display)' }}>servd<span className="text-brand">.</span></div>
            <p className="mt-1 text-xs font-semibold tracking-wide text-muted uppercase">Platform admin</p>
          </div>
          <button onClick={logout} className="rounded-lg p-2 text-muted hover:bg-soft lg:hidden" aria-label="Log out"><LogOut size={18} /></button>
        </div>
        <div className="px-3 pb-2 lg:pb-3">
          <button onClick={() => go('onboard')} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-3 py-2.5 text-sm font-bold text-brand-ink hover:brightness-95">
            <Plus size={17} />Onboard a vendor
          </button>
        </div>
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-0">
          {NAV.map(n => (
            <button key={n.key} onClick={() => go(n.key)} aria-current={active === n.key ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition ${active === n.key ? 'bg-ink text-white' : 'text-ink-2 hover:bg-soft'}`}>
              <n.icon size={18} />{n.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto hidden border-t border-line p-4 text-sm lg:block">
          <p className="px-3 text-xs text-muted">Logged in as {me.name}</p>
          <button onClick={logout} className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-muted hover:bg-soft"><LogOut size={16} />Log out</button>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div key={nonce} className="mx-auto max-w-6xl">
          {tab === 'overview' && <Overview nav={nav} />}
          {tab === 'leads' && <Leads nav={nav} />}
          {tab === 'vendors' && (vendor ? <VendorDetail id={vendor} nav={nav} /> : <Vendors nav={nav} />)}
          {tab === 'onboard' && <Onboard nav={nav} prefill={prefill} />}
          {tab === 'billing' && <Billing nav={nav} />}
          {tab === 'customers' && <Customers />}
          {tab === 'support' && <SupportDesk nav={nav} />}
          {tab === 'activity' && <ActivityLog />}
        </div>
      </main>
    </div>
  );
}

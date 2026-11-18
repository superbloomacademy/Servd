'use client';
import { useEffect, useMemo, useState } from 'react';
import { Building2, ChevronRight, Plus, Search } from 'lucide-react';
import { api, rupee } from '@/lib/client';
import { Btn, Empty, Spinner } from '@/components/ui/kit';
import { DemoBadge, Logo, PageHead, Progress, TYPE_LABEL, VendorStatus, day, pct } from './common';
import type { Nav } from './super-admin';

type Row = {
  isDemo?: boolean; id: string; name: string; brandColor: string; logoUrl: string | null; status: string; stage: string; liveAt: string | null; trialEndsAt: string | null;
  createdAt: string; city: string; types: string[]; owner: { name: string; phone: string } | null; venues: number;
  orders30: number; sales30: number; commissionBps: number; monthlyFeePaise: number; setup: { done: number; total: number; ready: boolean };
};

export function Vendors({ nav }: { nav: Nav }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  useEffect(() => { api<{ vendors: Row[] }>('/api/admin/vendors').then(r => setRows(r.vendors)); }, []);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows || [])
      .filter(v => filter === 'all' || (filter === 'suspended' ? v.status === 'suspended' : v.status === 'active' && v.stage === filter))
      .filter(v => !t || `${v.name} ${v.city} ${v.owner?.name} ${v.owner?.phone}`.toLowerCase().includes(t))
      .sort((a, b) => b.sales30 - a.sales30 || a.name.localeCompare(b.name));
  }, [rows, filter, q]);
  if (!rows) return <div className="grid place-items-center py-24"><Spinner className="text-muted" /></div>;
  const n = (f: string) => rows.filter(v => f === 'suspended' ? v.status === 'suspended' : v.status === 'active' && v.stage === f).length;

  return (
    <div>
      <PageHead title="Vendors" sub="Every business on the platform. Open one to see its venues, setup progress, logins and bills."
        right={<Btn tone="dark" onClick={() => nav.go('onboard')}><Plus size={16} />Onboard a vendor</Btn>} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {[['all', `All (${rows.length})`], ['live', `Live (${n('live')})`], ['setup', `Setting up (${n('setup')})`], ['suspended', `Suspended (${n('suspended')})`]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold ${filter === k ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-2 hover:bg-soft'}`}>{l}</button>
        ))}
        <label className="ml-auto flex min-w-[220px] items-center gap-2 rounded-xl border border-line bg-white px-3 py-2"><Search size={16} className="text-muted" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, city, owner phone" className="w-full text-sm outline-none" /></label>
      </div>

      {!shown.length ? <div className="rounded-2xl bg-white"><Empty icon={<Building2 />} title="No vendors here">Try another filter, or onboard a new vendor.</Empty></div> : (
        <div className="overflow-hidden rounded-2xl bg-white">
          <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_24px] gap-4 border-b border-line px-4 py-2.5 text-xs font-semibold text-muted md:grid">
            <span>Vendor</span><span>Status</span><span className="text-right">Sales · 30 days</span><span className="text-right">Plan</span><span />
          </div>
          <ul className="divide-y divide-line">
            {shown.map(v => (
              <li key={v.id}>
                <button onClick={() => nav.go('vendors', { vendor: v.id })} className="grid w-full gap-2 px-4 py-3 text-left hover:bg-soft md:grid-cols-[2fr_1fr_1fr_1fr_24px] md:items-center md:gap-4">
                  <span className="flex min-w-0 items-center gap-3">
                    <Logo name={v.name} color={v.brandColor} url={v.logoUrl} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 font-bold"><span className="truncate">{v.name}</span>{v.isDemo && <DemoBadge />}</span>
                      <span className="block truncate text-xs text-muted">{[v.types.map(t => TYPE_LABEL[t]).join(', '), v.city, `${v.venues} venue${v.venues === 1 ? '' : 's'}`, v.owner && `${v.owner.name} · ${v.owner.phone}`].filter(Boolean).join(' · ')}</span>
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <VendorStatus status={v.status} stage={v.stage} />
                    {v.stage === 'setup' ? <Progress done={v.setup.done} total={v.setup.total} /> : <span className="text-xs text-muted">since {day(v.liveAt)}</span>}
                  </span>
                  <span className="tabular md:text-right"><span className="font-bold">{rupee(v.sales30)}</span> <span className="text-xs text-muted">{v.orders30} orders</span></span>
                  <span className="text-xs text-muted md:text-right">
                    {pct(v.commissionBps)}{v.monthlyFeePaise ? ` + ${rupee(v.monthlyFeePaise)}/mo` : ''}
                    {v.trialEndsAt && new Date(v.trialEndsAt) > new Date() && <span className="block font-semibold text-[#9A5500]">Trial till {day(v.trialEndsAt)}</span>}
                  </span>
                  <ChevronRight size={18} className="hidden text-faint md:block" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

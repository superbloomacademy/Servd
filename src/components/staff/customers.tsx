'use client';
import { useEffect, useMemo, useState } from 'react';
import { Contact, Download, Search } from 'lucide-react';
import { api, rupee, timeAgo } from '@/lib/client';
import { Empty, Pill, Spinner } from '@/components/ui/kit';
import { PageHead } from './shell';
import type { VenueCtx } from './types';

type C = { id: string; name: string; phone: string; orders: number; spend: number; firstAt: string; lastAt: string; favourite: string | null };
const SEG = [['all', 'Everyone'], ['regular', 'Regulars (3+ visits)'], ['new', 'New in 30 days'], ['lost', 'Not seen in 30 days']] as const;

// Customer list (CRM): who comes, how often, how much they spend, what they like. Export for WhatsApp / SMS offers.
export function Customers({ venue }: { venue: VenueCtx }) {
  const [list, setList] = useState<C[] | null>(null);
  const [q, setQ] = useState('');
  const [seg, setSeg] = useState<(typeof SEG)[number][0]>('all');
  useEffect(() => {
    const t = setTimeout(() => api<{ customers: C[] }>(`/api/staff/v/${venue.id}/customers?q=${encodeURIComponent(q)}`).then(r => setList(r.customers)).catch(() => setList([])), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [venue.id, q]);

  const month = Date.now() - 30 * 864e5;
  const shown = useMemo(() => (list || []).filter(c => seg === 'all' || (seg === 'regular' ? c.orders >= 3 : seg === 'new' ? +new Date(c.firstAt) >= month : +new Date(c.lastAt) < month)), [list, seg, month]);
  const csv = () => {
    const rows = [['Name', 'Mobile', 'Orders', 'Total spend', 'First visit', 'Last visit', 'Favourite'], ...shown.map(c => [c.name, c.phone, c.orders, c.spend / 100, c.firstAt.slice(0, 10), c.lastAt.slice(0, 10), c.favourite || ''])];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + rows.map(r => r.map(x => { const s = String(x); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n')], { type: 'text/csv' }));
    a.download = `customers-${seg}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const total = (list || []).length, regulars = (list || []).filter(c => c.orders >= 3).length;

  return (
    <div>
      <PageHead title="Customers" sub="Everyone who ordered by QR, or gave their mobile number at the counter, across all your venues. Use it to call back regulars or send offers."
        right={<button onClick={csv} disabled={!shown.length} className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm font-semibold disabled:opacity-40"><Download size={15} />Excel (CSV)</button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 focus-within:border-ink">
          <Search size={16} className="text-muted" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Name or mobile" aria-label="Search customers" className="w-48 py-2.5 text-sm outline-none" />
        </label>
        <div className="no-scrollbar flex gap-1 overflow-x-auto">{SEG.map(([k, l]) => <button key={k} onClick={() => setSeg(k)} className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold ${seg === k ? 'bg-ink text-white' : 'bg-white text-ink-2'}`}>{l}</button>)}</div>
        {list && <span className="ml-auto text-sm text-muted">{total} customers · {regulars} regulars</span>}
      </div>
      {!list ? <div className="grid place-items-center py-24"><Spinner className="text-muted" /></div> : shown.length ? (
        <div className="overflow-x-auto rounded-2xl bg-white">
          <table className="w-full min-w-[680px] text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="px-4 py-3">Customer</th><th className="text-right">Orders</th><th className="text-right">Spent</th><th className="text-right">Avg</th><th className="pl-6">Last visit</th><th>Favourite</th></tr></thead>
            <tbody>
              {shown.map(c => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5"><b>{c.name || 'Guest'}</b>{c.orders >= 3 && <Pill tone="brand" className="ml-2">Regular</Pill>}<span className="tabular block text-xs text-muted"><a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a></span></td>
                  <td className="tabular text-right font-semibold">{c.orders}</td>
                  <td className="tabular text-right">{rupee(c.spend)}</td>
                  <td className="tabular text-right text-muted">{rupee(Math.round(c.spend / c.orders))}</td>
                  <td className="pl-6 text-muted">{timeAgo(c.lastAt)}</td>
                  <td className="text-muted">{c.favourite || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="rounded-2xl bg-white"><Empty icon={<Contact />} title={q ? 'No match' : 'No customers yet'}>Customers appear after their first paid order. At the counter, type the guest’s mobile number on the bill to add them.</Empty></div>}
    </div>
  );
}

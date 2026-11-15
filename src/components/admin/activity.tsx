'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, timeAgo } from '@/lib/client';
import { Btn, Spinner } from '@/components/ui/kit';
import { PageHead } from './common';

type E = { id: number; action: string; staffName: string | null; vendorName: string; venueName: string; entity: string; after: Record<string, unknown> | null; at: string };

const summary = (e: E) => {
  const a = e.after || {};
  const bits = ['kotNo', 'name', 'reason', 'method', 'month', 'status', 'reference'].filter(k => a[k] !== undefined && a[k] !== null && a[k] !== '').map(k => `${k === 'kotNo' ? 'KOT' : k} ${a[k]}`);
  if (typeof a.amountPaise === 'number') bits.push(`₹${(a.amountPaise / 100).toLocaleString('en-IN')}`);
  if (typeof a.totalPaise === 'number') bits.push(`₹${(a.totalPaise / 100).toLocaleString('en-IN')}`);
  return bits.join(' · ');
};

// Every confirmed action on the platform: who did what, where, when.
export function ActivityLog() {
  const [rows, setRows] = useState<E[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (before?: number) => {
    setBusy(true);
    const r = await api<{ entries: E[]; next: number | null }>(`/api/admin/activity${before ? `?before=${before}` : ''}`);
    setRows(p => before ? [...(p || []), ...r.entries] : r.entries); setNext(r.next); setBusy(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!rows) return <div className="grid place-items-center py-24"><Spinner className="text-muted" /></div>;
  return (
    <div>
      <PageHead title="Activity log" sub="Payments confirmed, orders rejected, price changes, logins turned off, bills recorded… Nothing can be edited or deleted here." />
      <div className="rounded-2xl bg-white">
        <ul className="divide-y divide-line text-sm">
          {rows.map(e => (
            <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-2.5">
              <span className="min-w-0"><b className="font-semibold">{e.staffName || 'System'}</b> <span className="text-ink-2">{e.action.replace(/_/g, ' ')}</span>
                {summary(e) && <span className="text-muted"> · {summary(e)}</span>}
                <span className="block text-xs text-muted">{[e.vendorName, e.venueName].filter(Boolean).join(' · ') || 'Platform'}</span></span>
              <span className="shrink-0 text-xs text-muted">{timeAgo(e.at)}</span>
            </li>
          ))}
          {!rows.length && <li className="px-4 py-8 text-center text-muted">No activity yet.</li>}
        </ul>
      </div>
      {next && <div className="mt-3 text-center"><Btn tone="outline" loading={busy} onClick={() => load(next)}>Show older</Btn></div>}
    </div>
  );
}

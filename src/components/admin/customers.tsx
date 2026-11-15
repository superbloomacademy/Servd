'use client';
import { useEffect, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { api, rupee, timeAgo } from '@/lib/client';
import { Empty, Spinner } from '@/components/ui/kit';
import { PageHead, day } from './common';

type C = { id: string; name: string; phone: string; email: string; createdAt: string; orders: number; spent: number; lastAt: string | null; venues: number };

// Look up a customer (for support calls): who they are, how much they've ordered, when.
export function Customers() {
  const [q, setQ] = useState('');
  const [d, setD] = useState<{ total: number; customers: C[] } | null>(null);
  useEffect(() => {
    const t = setTimeout(() => api(`/api/admin/customers?q=${encodeURIComponent(q)}`).then(setD), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div>
      <PageHead title="Customers" sub={d ? `${d.total} customers have logged in. Search by mobile number, email or name.` : ''} />
      <label className="mb-3 flex max-w-md items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5"><Search size={16} className="text-muted" />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="98765…, name@gmail.com, Ravi" className="w-full text-sm outline-none" /></label>
      {!d ? <div className="grid place-items-center py-24"><Spinner className="text-muted" /></div> : !d.customers.length ? (
        <div className="rounded-2xl bg-white"><Empty icon={<Users />} title="No customers found">Check the number or try part of it.</Empty></div>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white">
          <table className="w-full min-w-[680px] text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="px-4 py-2.5 font-semibold">Customer</th><th className="font-semibold">Email</th><th className="text-right font-semibold">Orders</th><th className="text-right font-semibold">Spent</th><th className="px-4 text-right font-semibold">Last order</th></tr></thead>
            <tbody>
              {d.customers.map(c => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5"><b className="font-semibold">{c.name || 'No name'}</b><span className="tabular block text-xs text-muted">+91 {c.phone} · joined {day(c.createdAt)}</span></td>
                  <td className="text-ink-2">{c.email || <span className="text-faint">—</span>}</td>
                  <td className="tabular text-right">{c.orders}{c.venues > 1 && <span className="block text-xs text-muted">{c.venues} venues</span>}</td>
                  <td className="tabular text-right">{rupee(c.spent)}</td>
                  <td className="px-4 text-right text-muted">{c.lastAt ? timeAgo(c.lastAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

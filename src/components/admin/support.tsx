'use client';
import { useCallback, useEffect, useState } from 'react';
import { Headset, Phone } from 'lucide-react';
import { api, rupee, timeAgo } from '@/lib/client';
import { Btn, Empty, Pill, Spinner, inputCls } from '@/components/ui/kit';
import { useConfirm, useToast } from '@/components/ui/providers';
import { PageHead } from './common';
import type { Nav } from './super-admin';

type T = {
  id: string; topic: string; message: string; status: 'open' | 'resolved'; reply: string | null; createdAt: string;
  customerName: string; customerPhone: string; customerEmail: string; venueId: string | null; venueName: string; vendorName: string; vendorPhone: string | null;
  kotNo: number | null; orderTotal: number | null;
};

// Every customer help request on the platform. Venues answer their own; we step in when they don't.
export function SupportDesk({ nav }: { nav: Nav }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<T[] | null>(null);
  const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const load = useCallback(() => api<{ tickets: T[] }>('/api/admin/support').then(r => setList(r.tickets)), []);
  useEffect(() => { load(); }, [load]);
  if (!list) return <div className="grid place-items-center py-24"><Spinner className="text-muted" /></div>;
  const shown = list.filter(t => filter === 'all' || t.status === filter);
  const reply = async (t: T) => {
    if (!(await confirm({ title: 'Send this reply as Servd support?', body: 'The customer sees it on their account page, and the request is marked resolved for the venue too.', confirm: 'Send reply', tone: 'primary' }))) return;
    try { await api('/api/admin/support', { body: { id: t.id, reply: draft[t.id] } }); toast('Reply sent'); setDraft({ ...draft, [t.id]: '' }); load(); }
    catch (e) { toast((e as Error).message, 'bad'); }
  };
  return (
    <div>
      <PageHead title="Support" sub="Help requests from customers at every venue. Venues reply from their own dashboard; requests open for more than a day show on the Overview." />
      <div className="mb-3 flex gap-2">
        {(['open', 'resolved', 'all'] as const).map(k => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold ${filter === k ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-2 hover:bg-soft'}`}>
            {k === 'open' ? `Waiting (${list.filter(t => t.status === 'open').length})` : k === 'resolved' ? 'Replied' : 'All'}
          </button>
        ))}
      </div>
      {!shown.length ? <div className="rounded-2xl bg-white"><Empty icon={<Headset />} title={filter === 'open' ? 'No one is waiting' : 'Nothing here'}>All caught up.</Empty></div> : (
        <div className="space-y-3">
          {shown.map(t => {
            const old = t.status === 'open' && Date.now() - new Date(t.createdAt).getTime() > 24 * 3600e3;
            return (
              <div key={t.id} className="rounded-2xl bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-bold">{t.topic}{t.status === 'resolved' ? <Pill tone="good">Replied</Pill> : old ? <Pill tone="bad">Waiting 24 h+</Pill> : <Pill tone="warn">Waiting</Pill>}</p>
                    <p className="text-xs text-muted">{[t.vendorName && `${t.vendorName} · ${t.venueName}`, t.kotNo && `KOT ${t.kotNo}${t.orderTotal ? ` · ${rupee(t.orderTotal)}` : ''}`, timeAgo(t.createdAt)].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <a href={`tel:+91${t.customerPhone}`} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[13px] font-semibold hover:bg-soft"><Phone size={13} />Customer</a>
                    {t.vendorPhone && <a href={`tel:${t.vendorPhone}`} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[13px] font-semibold hover:bg-soft"><Phone size={13} />Venue</a>}
                    {t.venueId && <Btn size="sm" tone="outline" onClick={() => nav.openVenue(t.venueId!)}>Open venue</Btn>}
                  </div>
                </div>
                <p className="mt-2 text-sm text-ink-2">“{t.message}”</p>
                <p className="mt-1 text-xs text-muted">{t.customerName || 'Customer'} · +91 {t.customerPhone}{t.customerEmail ? ` · ${t.customerEmail}` : ''}</p>
                {t.reply && <p className="mt-2 rounded-xl bg-soft p-3 text-sm whitespace-pre-line"><b className="block text-xs text-muted">Reply</b>{t.reply}</p>}
                {t.status === 'open' && (
                  <div className="mt-3 flex gap-2">
                    <input className={inputCls} value={draft[t.id] || ''} onChange={e => setDraft({ ...draft, [t.id]: e.target.value })} placeholder="Reply as Servd support…" />
                    <Btn tone="dark" disabled={!(draft[t.id] || '').trim()} onClick={() => reply(t)}>Send</Btn>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

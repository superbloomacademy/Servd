'use client';
import { useCallback, useEffect, useState } from 'react';
import { MessageCircleQuestion } from 'lucide-react';
import { api, timeAgo, useRealtime } from '@/lib/client';
import { Btn, Empty, Pill } from '@/components/ui/kit';
import { useToast } from '@/components/ui/providers';
import { PageHead } from './shell';
import type { VenueCtx } from './types';

type Ticket = { id: string; topic: string; message: string; status: 'open' | 'resolved'; reply: string | null; createdAt: string; customerName: string; customerPhone: string; kotNo: number | null };

export function Support({ venue }: { venue: VenueCtx }) {
  const toast = useToast();
  const [list, setList] = useState<Ticket[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const load = useCallback(async () => setList((await api<{ tickets: Ticket[] }>(`/api/staff/v/${venue.id}/support`)).tickets), [venue.id]);
  useEffect(() => { load(); }, [load]);
  useRealtime([`venue:${venue.id}`], { support: () => load() });
  const reply = async (t: Ticket) => {
    try { await api(`/api/staff/v/${venue.id}/support`, { body: { id: t.id, reply: draft[t.id] } }); toast('Reply sent'); load(); } catch (e) { toast((e as Error).message, 'bad'); }
  };
  return (
    <div className="max-w-3xl">
      <PageHead title="Customer help" sub="Problems customers report from their order page. They see your reply in their account." />
      {list && !list.length && <div className="rounded-2xl bg-white"><Empty icon={<MessageCircleQuestion />} title="No help requests">Good sign.</Empty></div>}
      <div className="space-y-3">
        {(list || []).map(t => (
          <article key={t.id} className="rounded-2xl bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><b>{t.topic}</b><Pill tone={t.status === 'open' ? 'warn' : 'good'}>{t.status === 'open' ? 'Needs reply' : 'Replied'}</Pill></div>
            <p className="mt-1 text-sm text-ink-2">{t.message}</p>
            <p className="mt-1 text-xs text-muted">{t.customerName || 'Customer'} · {t.customerPhone}{t.kotNo ? ` · KOT ${t.kotNo}` : ''} · {timeAgo(t.createdAt)}</p>
            {t.reply ? <p className="mt-3 rounded-xl bg-soft p-3 text-sm"><b className="block text-xs text-muted">Your reply</b>{t.reply}</p> : (
              <div className="mt-3 flex gap-2">
                <input value={draft[t.id] || ''} onChange={e => setDraft({ ...draft, [t.id]: e.target.value })} placeholder="Write a reply" aria-label="Reply" className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-ink" />
                <Btn tone="dark" disabled={!draft[t.id]?.trim()} onClick={() => reply(t)}>Send</Btn>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

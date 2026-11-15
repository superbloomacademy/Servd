'use client';
import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronRight, PartyPopper, QrCode, Rocket } from 'lucide-react';
import { api } from '@/lib/client';
import { Btn, Spinner } from '@/components/ui/kit';
import { useConfirm, useToast } from '@/components/ui/providers';
import { PageHead } from './shell';
import type { VenueCtx } from './types';

type Step = { key: string; label: string; hint: string; done: boolean; required: boolean; tab: string };
type Data = { checklist: { steps: Step[]; done: number; total: number; ready: boolean }; stage: 'setup' | 'live'; trialEndsAt: string | null };

// Owner's first screen after onboarding: a short checklist that opens the right section for each step.
export function GetStarted({ venue, go, isOwner, onLive }: { venue: VenueCtx; go: (tab: string) => void; isOwner: boolean; onLive: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [d, setD] = useState<Data | null>(null);
  const load = useCallback(() => api<Data>(`/api/staff/v/${venue.id}/setup`).then(setD), [venue.id]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <div className="grid place-items-center py-24"><Spinner className="text-muted" /></div>;
  const { steps, done, total, ready } = d.checklist;
  const pct = Math.round((done / total) * 100);
  const live = d.stage === 'live';

  const goLive = async () => {
    if (!(await confirm({ title: 'Start taking real orders?', body: 'Your venue shows as live. Make sure the QR stickers are up and your staff know how to confirm payments.', confirm: 'Go live', tone: 'primary' }))) return;
    try { await api(`/api/staff/v/${venue.id}/setup`, { body: {} }); toast('You’re live!'); load(); onLive(); }
    catch (e) { toast((e as Error).message, 'bad'); }
  };

  return (
    <div className="max-w-3xl">
      <PageHead title={live ? 'You’re live' : 'Get started'} sub={live ? 'Everything you set up is listed below. Keep improving your menu and photos to sell more.' : `A few steps and ${venue.name} is ready for orders. Each step opens the right screen.`} />
      <div className="rounded-2xl bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="font-bold">{done} of {total} done</p>
          {d.trialEndsAt && new Date(d.trialEndsAt) > new Date() && <p className="text-xs text-muted">Free trial until {new Date(d.trialEndsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>}
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-soft"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} /></div>
        <ol className="mt-4 divide-y divide-line">
          {steps.map((s, i) => (
            <li key={s.key}>
              <button onClick={() => go(s.tab)} className="flex w-full items-center gap-3 py-3 text-left hover:bg-soft">
                {s.done
                  ? <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-good text-white"><Check size={16} strokeWidth={3} /></span>
                  : <span className="tabular grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-line text-sm font-bold text-muted">{i + 1}</span>}
                <span className="min-w-0 flex-1">
                  <span className={`block font-semibold ${s.done ? 'text-muted' : ''}`}>{s.label}{!s.required && <span className="ml-1.5 text-xs font-normal text-muted">recommended</span>}</span>
                  {!s.done && <span className="block text-[13px] text-muted">{s.hint}</span>}
                </span>
                <ChevronRight size={18} className="shrink-0 text-faint" />
              </button>
            </li>
          ))}
        </ol>
      </div>

      {!live && (
        <div className={`mt-4 flex flex-wrap items-center gap-4 rounded-2xl p-5 ${ready ? 'bg-[#E7F6EF]' : 'bg-white'}`}>
          <span className={`grid h-11 w-11 place-items-center rounded-full ${ready ? 'bg-good text-white' : 'bg-soft text-muted'}`}>{ready ? <Rocket size={20} /> : <QrCode size={20} />}</span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">{ready ? 'Ready to go live' : 'Finish the first 4 steps to go live'}</p>
            <p className="text-sm text-muted">{ready ? 'Place a test order from your phone first if you haven’t yet.' : 'You can still place test orders while you set up.'}</p>
          </div>
          {isOwner && <Btn tone="good" disabled={!ready} onClick={goLive}><Rocket size={16} />Go live</Btn>}
        </div>
      )}
      {live && <p className="mt-4 flex items-center gap-2 text-sm text-muted"><PartyPopper size={16} />Taking orders. Customers scan your QR codes to order.</p>}
    </div>
  );
}

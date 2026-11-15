'use client';
import { useMemo, useState } from 'react';
import { Footprints } from 'lucide-react';
import { Btn, Empty, VegMark } from '@/components/ui/kit';
import { Age, useOrderActions } from './order-parts';
import { PageHead } from './shell';
import type { Live, VenueCtx } from './types';

// Runner's phone: packed seat orders sorted by screen and seat, so one trip covers one aisle.
export function Runner({ live, reload }: { venue: VenueCtx; live: Live; reload: () => void }) {
  const actions = useOrderActions(reload);
  const [tab, setTab] = useState<'ready' | 'out'>('ready');
  const list = useMemo(() => live.orders.filter(o => o.fulfilment === 'seat' && o.status === tab)
    .sort((a, b) => a.spotLabel.localeCompare(b.spotLabel, 'en', { numeric: true })), [live.orders, tab]);
  const count = (s: string) => live.orders.filter(o => o.fulfilment === 'seat' && o.status === s).length;

  return (
    <div className="mx-auto max-w-xl">
      <PageHead title="Seat delivery" sub="Check the KOT number on the customer’s phone before handing over. Keep your phone screen dim inside the hall." />
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-white p-1 text-sm font-semibold">
        {(['ready', 'out'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg py-2.5 ${tab === t ? 'bg-ink text-white' : 'text-muted'}`}>{t === 'ready' ? 'To pick up' : 'On the way'} ({count(t)})</button>
        ))}
      </div>
      <div className="space-y-3">
        {list.map(o => (
          <article key={o.id} className="rounded-2xl bg-white p-4">
            <div className="flex items-start justify-between">
              <div><p className="text-2xl font-extrabold">{o.spotLabel.replace('Screen', 'Scr')}</p><p className="tabular text-sm font-semibold text-muted">KOT {o.kotNo}{o.deliverAt === 'interval' ? ' · interval' : ''}</p></div>
              <Age ts={o.timeline.find(t => t.status === 'ready')?.at || o.createdAt} warnAt={5} />
            </div>
            <ul className="mt-2 space-y-1 text-[15px]">{o.items.map(i => <li key={i.id} className="flex items-center gap-2"><VegMark veg={i.veg} size={11} /><b className="tabular">{i.qty}×</b>{i.name}</li>)}</ul>
            {o.note && <p className="mt-2 text-sm text-[#7A4A00]">Note: {o.note}</p>}
            <Btn tone={tab === 'ready' ? 'dark' : 'good'} size="lg" className="mt-3 w-full" onClick={() => actions.advance(o, tab === 'ready' ? 'out' : 'delivered')}>
              {tab === 'ready' ? 'Picked up' : 'Delivered to seat'}
            </Btn>
          </article>
        ))}
        {!list.length && <div className="rounded-2xl bg-white"><Empty icon={<Footprints />} title={tab === 'ready' ? 'Nothing to pick up' : 'No orders on the way'}>Packed orders appear here with a sound.</Empty></div>}
      </div>
    </div>
  );
}

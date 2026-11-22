'use client';
// Table picker inside the billing screen: every table with its state, so a cashier starts from the floor.
import { Users } from 'lucide-react';
import { minsSince, rupee } from '@/lib/client';
import { TABLE_STYLE, dur, tableState, type Spot } from './tables';
import type { Live } from './types';

const WORD = { free: 'Free', seated: 'Seated', accept: 'Accept order', eating: 'Running', bill: 'Bill asked', 'paid?': 'Says paid' };

export function PosFloor({ spots, areas, live, current, onPick }: { spots: Spot[]; areas: { id: string; name: string }[]; live: Live; current: string; onPick: (spotId: string) => void }) {
  const groups = [...areas.map(a => ({ name: a.name, list: spots.filter(s => s.areaId === a.id) })), { name: 'Tables', list: spots.filter(s => !s.areaId) }].filter(g => g.list.length);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-24 lg:pb-2">
      {groups.map(g => (
        <section key={g.name} className="mb-4">
          <h2 className="mb-1.5 text-sm font-bold text-muted">{g.name}</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
            {g.list.map(s => {
              const b = live.tables.find(t => t.session.spotId === s.id), st = tableState(b);
              return (
                <button key={s.id} onClick={() => onPick(s.id)} aria-pressed={current === s.id} aria-label={`Table ${s.label}, ${WORD[st]}`}
                  className={`flex min-h-[84px] flex-col rounded-xl border-2 p-2.5 text-left transition active:scale-[.98] ${TABLE_STYLE[st]} ${current === s.id ? 'ring-2 ring-ink' : 'hover:shadow-sm'}`}>
                  <span className="flex items-baseline justify-between"><span className="text-lg leading-none font-extrabold">{s.label}</span>{b && b.session.guests > 0 && <span className="flex items-center gap-0.5 text-[11px] font-semibold text-ink-2"><Users size={11} />{b.session.guests}</span>}</span>
                  <span className="mt-auto text-[11px] font-semibold text-ink-2">{WORD[st]}{b && b.rounds.length > 0 && ` · ${dur(minsSince(b.session.openedAt))}`}</span>
                  {b && b.duePaise > 0 && <span className="tabular text-sm font-extrabold">{rupee(b.duePaise)}</span>}
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {!spots.length && <p className="rounded-2xl bg-white p-6 text-sm text-muted">No tables yet. Add them in QR codes.</p>}
    </div>
  );
}

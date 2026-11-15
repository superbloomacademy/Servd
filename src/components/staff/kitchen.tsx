'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChefHat, Clapperboard, Printer, StickyNote } from 'lucide-react';
import { api, clock, store, useRealtime } from '@/lib/client';
import { Btn, Empty, Pill, Toggle, VegMark } from '@/components/ui/kit';
import { useConfirm, useToast } from '@/components/ui/providers';
import { Age, useOrderActions } from './order-parts';
import { PageHead } from './shell';
import type { Live, Role, VenueCtx } from './types';

type Station = { id: string; name: string; isLive: boolean };
type MenuItem = { id: string; name: string; stationId: string | null; isLive: boolean; veg: boolean };

// Kitchen display: each station sees only its own KOT items. Live/Off for the station's items.
export function Kitchen({ venue, live, role, myStation, flash, reload }: { venue: VenueCtx; live: Live; role: Role; myStation: string | null; flash: Set<string>; reload: () => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const actions = useOrderActions(reload);
  const [stations, setStations] = useState<Station[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [station, setStation] = useState<string>(myStation || 'all');

  const loadMenu = useCallback(async () => {
    const m = await api<{ stations: Station[]; items: MenuItem[] }>(`/api/staff/v/${venue.id}/menu`);
    setStations(m.stations); setItems(m.items);
  }, [venue.id]);
  useEffect(() => { loadMenu(); }, [loadMenu]);
  useRealtime([`venue:${venue.id}`], { menu: () => loadMenu() });

  const tickets = useMemo(() => live.orders.flatMap(o => o.kots
    .filter(k => ['new', 'preparing'].includes(k.status) && (station === 'all' || k.stationId === station))
    .map(k => ({ o, k, items: o.items.filter(i => (station === 'all' ? i.stationId === k.stationId : i.stationId === station)) })))
    .sort((a, b) => +new Date(a.k.createdAt) - +new Date(b.k.createdAt)), [live.orders, station]);
  const held = live.orders.filter(o => o.kots.some(k => k.status === 'held' && (station === 'all' || k.stationId === station)) && !['cancelled', 'rejected'].includes(o.status)).length;
  const totals = useMemo(() => {
    const m = new Map<string, number>();
    tickets.forEach(t => t.items.forEach(i => m.set(i.name, (m.get(i.name) || 0) + i.qty)));
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [tickets]);

  const toggleItem = async (it: MenuItem) => {
    const ok = await confirm({
      title: it.isLive ? `Turn off ${it.name}?` : `Turn ${it.name} back on?`,
      body: it.isLive ? 'Customers will see it as “Sold out” and can’t order it until you turn it back on.' : 'Customers can order it again immediately.',
      confirm: it.isLive ? 'Turn off' : 'Turn on', tone: it.isLive ? 'danger' : 'primary',
    });
    if (!ok) return;
    try { await api(`/api/staff/menu/item/${it.id}`, { method: 'PATCH', body: { isLive: !it.isLive } }); toast(it.isLive ? `${it.name} is off` : `${it.name} is live`); loadMenu(); }
    catch (e) { toast((e as Error).message, 'bad'); }
  };
  const stationName = stations.find(s => s.id === station)?.name;
  const myItems = items.filter(i => station === 'all' || i.stationId === station);

  // Auto-print: every new KOT for this screen prints once on this device's printer.
  // For printing without the print dialog, open Chrome with --kiosk-printing (see README).
  const printKey = `sv_autoprint_${venue.id}_${station}`;
  const [autoPrint, setAutoPrint] = useState(false);
  const printed = useRef<Set<string> | null>(null);
  useEffect(() => { setAutoPrint(store.get(printKey, false)); printed.current = null; }, [printKey]);
  useEffect(() => {
    if (!autoPrint) { printed.current = null; return; }
    const fresh = tickets.filter(t => t.k.status === 'new');
    if (!printed.current) { printed.current = new Set(fresh.map(t => t.k.id)); return; }   // don't reprint what was already on screen
    for (const t of fresh) {
      if (printed.current.has(t.k.id)) continue;
      printed.current.add(t.k.id);
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
      f.src = `/print/kot/${t.o.id}${t.k.stationId ? `?station=${t.k.stationId}` : ''}`;
      document.body.appendChild(f);
      setTimeout(() => f.remove(), 60000);
    }
  }, [tickets, autoPrint]);
  const flipAutoPrint = async () => {
    const next = !autoPrint;
    const ok = await confirm({
      title: next ? 'Print every new KOT automatically?' : 'Stop automatic printing?',
      body: next ? 'Each new ticket for this screen prints on this device’s printer as it arrives. Keep this screen open. Turn it on for one device per station only.' : 'New tickets will only show on screen. You can still print one with its Print button.',
      confirm: next ? 'Turn on' : 'Turn off', tone: 'primary',
    });
    if (!ok) return;
    store.set(printKey, next); setAutoPrint(next); toast(next ? 'Auto-print on for this device' : 'Auto-print off');
  };

  return (
    <div>
      <PageHead title={stationName ? `${stationName} · KOT` : 'Kitchen tickets (KOT)'}
        sub="Oldest tickets first. Tap Start when you begin and Ready when it’s packed. Interval orders appear here about 15 minutes before the interval."
        right={<>
          <label className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold"><Printer size={16} />Auto-print<Toggle on={autoPrint} onChange={flipAutoPrint} label="Auto-print new KOTs" /></label>
          {!myStation && (
            <select value={station} onChange={e => setStation(e.target.value)} aria-label="Station" className="rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-semibold">
              <option value="all">All stations</option>{stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </>} />

      {totals.length > 0 && (
        <div className="mb-4 rounded-2xl bg-white p-4">
          <p className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">To prepare now</p>
          <div className="flex flex-wrap gap-2">{totals.map(([n, q]) => <span key={n} className="rounded-xl border border-line px-3 py-1.5 text-sm font-semibold"><b className="tabular mr-1.5 text-brand-text">{q}</b>{n}</span>)}</div>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        <div>
          {held > 0 && <p className="mb-3 text-sm text-muted">{held} order{held > 1 ? 's' : ''} waiting for payment or the interval. They’ll appear here when it’s time.</p>}
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {tickets.map(({ o, k, items: its }) => (
              <article key={k.id} className={`relative rounded-md border bg-white p-4 font-mono ${flash.has(o.id) ? 'anim-pop border-brand' : 'border-line'} ${k.status === 'preparing' ? 'border-l-4 border-l-warn' : 'border-l-4 border-l-[#2F6FDB]'}`}>
                <div className="flex justify-between text-xs text-muted"><span>KOT #{o.kotNo}</span><span>{k.stationName}</span></div>
                <p className="mt-1 font-sans text-2xl font-extrabold">{o.spotLabel}</p>
                <div className="mt-1 flex items-center gap-2 font-sans"><Age ts={k.createdAt} warnAt={10} /><span className="text-xs text-muted">{clock(k.createdAt)}</span>
                  {o.deliverAt === 'interval' && <Pill tone="brand"><Clapperboard size={12} />Interval</Pill>}{k.status === 'preparing' && <Pill tone="warn">Preparing</Pill>}</div>
                <ul className="mt-3 space-y-1.5 border-y border-dashed border-line py-3 text-[17px]">
                  {its.map(i => <li key={i.id} className="flex items-center gap-2"><VegMark veg={i.veg} size={12} /><b className="tabular w-8">{i.qty}×</b><span className="font-sans font-semibold">{i.name}</span></li>)}
                </ul>
                {o.note && <p className="mt-2 flex gap-1.5 font-sans text-sm text-[#7A4A00]"><StickyNote size={15} className="mt-0.5 shrink-0" />{o.note}</p>}
                <div className="mt-3 flex gap-2 font-sans">
                  {k.status === 'new' ? <Btn tone="dark" className="flex-1" onClick={() => actions.kot(k, 'preparing', o.kotNo)}>Start</Btn>
                    : <Btn tone="good" className="flex-1" onClick={() => actions.kot(k, 'ready', o.kotNo)}>Ready</Btn>}
                  <a href={`/print/kot/${o.id}${station !== 'all' ? `?station=${station}` : ''}`} target="_blank" rel="noopener" className="grid place-items-center rounded-xl border border-line px-3 text-muted hover:bg-soft" aria-label="Print KOT"><Printer size={17} /></a>
                </div>
              </article>
            ))}
          </div>
          {!tickets.length && <div className="rounded-2xl bg-white"><Empty icon={<ChefHat />} title="No open tickets">New KOTs will appear here with a sound.</Empty></div>}
        </div>

        {(role === 'station' || role === 'owner' || role === 'manager' || role === 'cashier') && (
          <aside className="h-fit rounded-2xl bg-white p-4">
            <h2 className="font-bold">Items{stationName ? ` at ${stationName}` : ''}</h2>
            <p className="mb-3 text-xs text-muted">Switch off anything that runs out. Customers see it as sold out within a second.</p>
            <ul className="divide-y divide-line">
              {myItems.map(it => (
                <li key={it.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className={`flex min-w-0 items-center gap-2 text-sm ${it.isLive ? '' : 'text-faint line-through'}`}><VegMark veg={it.veg} size={11} /><span className="truncate">{it.name}</span></span>
                  <Toggle on={it.isLive} onChange={() => toggleItem(it)} label={`${it.name} live`} />
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </div>
  );
}

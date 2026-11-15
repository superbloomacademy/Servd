'use client';
import { useCallback, useEffect, useState } from 'react';
import { Copy, Download, ExternalLink, Plus, Printer, RefreshCcw, Power } from 'lucide-react';
import { api, hhmm, timeAgo } from '@/lib/client';
import { Btn, Field, Pill, Sheet, inputCls } from '@/components/ui/kit';
import { useConfirm, useToast } from '@/components/ui/providers';
import { PageHead } from './shell';
import type { VenueCtx } from './types';

type ShowRow = { time: string; movie: string; durationMin: number; intervalAfterMin: number };
type Area = { id: string; name: string; rows: string | null; seatsPerRow: number | null; shows: ShowRow[] };
type Spot = { id: string; areaId: string | null; label: string; kind: 'seat' | 'table' | 'counter' | 'shop'; active: boolean };
type QrOne = { id: string; label: string; areaName: string; url: string; svg: string; png?: string; active: boolean; codeReplacedAt: string | null };

export function SpotsQr({ venue }: { venue: VenueCtx }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [areas, setAreas] = useState<Area[]>([]);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [one, setOne] = useState<QrOne | null>(null);
  const [adding, setAdding] = useState(false);
  const [shows, setShows] = useState<ShowRow[] | null>(null);

  const load = useCallback(async () => {
    const r = await api<{ areas: Area[]; spots: Spot[] }>(`/api/staff/v/${venue.id}/spots`);
    setAreas(r.areas); setSpots(r.spots);
    setAreaId(a => (a && r.areas.some(x => x.id === a) ? a : r.areas[0]?.id ?? null));
  }, [venue.id]);
  useEffect(() => { load(); }, [load]);

  const area = areas.find(a => a.id === areaId);
  const list = spots.filter(s => s.areaId === areaId);
  const isScreen = !!area?.rows;
  const open = async (s: Spot) => {
    try { const r = await api<{ spots: QrOne[] }>(`/api/staff/v/${venue.id}/qr?spot=${s.id}`); setOne(r.spots[0]); }
    catch (e) { toast((e as Error).message, 'bad'); }
  };
  const replace = async () => {
    if (!one) return;
    const ok = await confirm({ title: `Replace the QR code for ${one.label}?`, body: <>The sticker currently on <b>{one.label}</b> stops working <b>immediately</b>. Print the new sticker and put it on right away. Use this if a sticker was copied, damaged or misused.</>, confirm: 'Replace code', tone: 'danger' });
    if (!ok) return;
    await api(`/api/staff/spots/${one.id}`, { body: { action: 'replace_code' } });
    toast(`New code for ${one.label}. Print the new sticker.`);
    open({ id: one.id } as Spot);
  };
  const power = async () => {
    if (!one) return;
    const ok = await confirm({ title: one.active ? `Switch off the QR for ${one.label}?` : `Switch the QR for ${one.label} back on?`,
      body: one.active ? 'Scanning it will show “This QR code is switched off”. Use this for a broken seat or a reserved table.' : 'Customers can order from it again.', confirm: one.active ? 'Switch off' : 'Switch on', tone: one.active ? 'danger' : 'primary' });
    if (!ok) return;
    await api(`/api/staff/spots/${one.id}`, { method: 'PATCH', body: { active: !one.active } });
    toast(one.active ? 'QR switched off' : 'QR switched on'); setOne({ ...one, active: !one.active }); load();
  };
  const saveShows = async () => {
    if (!area || !shows) return;
    try { await api(`/api/staff/areas/${area.id}`, { method: 'PATCH', body: { shows: shows.filter(s => s.time && s.movie) } }); toast('Show times saved'); setShows(null); load(); }
    catch (e) { toast((e as Error).message, 'bad'); }
  };
  const rows = isScreen ? [...new Set(list.map(s => s.label.replace(/\d+$/, '')))] : [];

  return (
    <div>
      <PageHead title="QR codes" sub="Every seat, table and counter has its own permanent QR code. The link holds a secret code, not the seat number, so nobody can change it to order for another seat."
        right={<>{area && <a href={`/print/qr/${venue.id}?area=${area.id}`} target="_blank" rel="noopener"><Btn tone="outline"><Printer size={16} />Print all stickers</Btn></a>}<Btn tone="dark" onClick={() => setAdding(true)}><Plus size={16} />Add</Btn></>} />

      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
        {areas.map(a => <button key={a.id} onClick={() => { setAreaId(a.id); setShows(null); }} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${a.id === areaId ? 'bg-ink text-white' : 'bg-white text-ink-2'}`}>{a.name} <span className="opacity-60">{spots.filter(s => s.areaId === a.id).length}</span></button>)}
      </div>

      {area && (
        <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <section className="min-w-0 rounded-2xl bg-white p-4 sm:p-6">
            {isScreen ? (
              <div className="overflow-x-auto">
                <div className="mx-auto mb-1 h-2 w-2/3 rounded-b-full bg-brand" /><p className="mb-5 text-center text-[11px] font-semibold tracking-[0.2em] text-muted uppercase">Screen this way</p>
                {rows.map(r => (
                  <div key={r} className="mb-1.5 flex items-center justify-center gap-1.5">
                    <span className="w-5 text-center text-xs font-bold text-muted">{r}</span>
                    {list.filter(s => s.label.replace(/\d+$/, '') === r).map(s => (
                      <button key={s.id} onClick={() => open(s)} title={`Seat ${s.label}`}
                        className={`grid h-7 w-7 place-items-center rounded-t-lg rounded-b-sm border text-[10px] font-semibold transition hover:border-brand hover:bg-brand hover:text-brand-ink ${s.active ? 'border-line bg-soft text-ink-2' : 'border-dashed border-bad text-bad'}`}>{s.label.replace(/^[A-Z]+/, '')}</button>
                    ))}
                    <span className="w-5 text-center text-xs font-bold text-muted">{r}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {list.map(s => (
                  <button key={s.id} onClick={() => open(s)} className={`flex aspect-square flex-col items-center justify-center rounded-2xl border-2 transition hover:border-brand ${s.active ? 'border-line' : 'border-dashed border-bad'}`}>
                    <span className="text-xl font-extrabold">{s.label}</span><span className="text-xs text-muted">{s.kind === 'table' ? 'Table' : 'Counter'}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="mt-5 text-center text-xs text-muted">Click any {isScreen ? 'seat' : 'table'} to see its own QR code.</p>
          </section>

          {isScreen && (
            <aside className="h-fit rounded-2xl bg-white p-4">
              <div className="flex items-center justify-between"><h2 className="font-bold">Shows on {area.name}</h2>
                {!shows && <button onClick={() => setShows(area.shows.map(s => ({ ...s })))} className="text-sm font-semibold text-brand-text">Edit</button>}</div>
              <p className="mt-1 mb-3 text-xs text-muted">Ordering opens 30 min before each show and stops when it ends. Interval orders reach the kitchen 15 min before the interval.</p>
              {!shows ? (
                <ul className="divide-y divide-line text-sm">{area.shows.map((s, i) => <li key={i} className="flex justify-between gap-2 py-2"><span className="tabular font-semibold">{hhmm(s.time)}</span><span className="truncate text-ink-2">{s.movie}</span><span className="tabular text-muted">{s.durationMin}m</span></li>)}</ul>
              ) : (
                <div className="space-y-2">
                  {shows.map((s, i) => (
                    <div key={i} className="grid grid-cols-[72px_1fr_auto] items-center gap-1.5">
                      <input aria-label="Start time" type="time" value={s.time} onChange={e => setShows(shows.map((x, k) => (k === i ? { ...x, time: e.target.value } : x)))} className="rounded-lg border border-line px-1.5 py-1.5 text-xs" />
                      <input aria-label="Movie" value={s.movie} onChange={e => setShows(shows.map((x, k) => (k === i ? { ...x, movie: e.target.value } : x)))} className="min-w-0 rounded-lg border border-line px-2 py-1.5 text-xs" placeholder="Movie" />
                      <button onClick={() => setShows(shows.filter((_, k) => k !== i))} className="px-1 text-xs text-bad" aria-label="Remove show">✕</button>
                      <label className="col-span-3 flex gap-2 text-[11px] text-muted">Length <input type="number" value={s.durationMin} onChange={e => setShows(shows.map((x, k) => (k === i ? { ...x, durationMin: Number(e.target.value) } : x)))} className="w-14 rounded border border-line px-1" /> min · interval after <input type="number" value={s.intervalAfterMin} onChange={e => setShows(shows.map((x, k) => (k === i ? { ...x, intervalAfterMin: Number(e.target.value) } : x)))} className="w-14 rounded border border-line px-1" /> min</label>
                    </div>
                  ))}
                  <button onClick={() => setShows([...shows, { time: '18:00', movie: '', durationMin: 150, intervalAfterMin: 75 }])} className="text-sm font-semibold text-brand-text">+ Add show</button>
                  <div className="flex gap-2 pt-2"><Btn tone="outline" size="sm" onClick={() => setShows(null)}>Cancel</Btn><Btn tone="dark" size="sm" onClick={saveShows}>Save shows</Btn></div>
                </div>
              )}
            </aside>
          )}
        </div>
      )}

      <Sheet open={!!one} onClose={() => setOne(null)} title={one ? `${one.areaName} · ${one.label}` : ''}>
        {one && (
          <div className="p-5">
            <div className={`mx-auto w-full max-w-[280px] rounded-2xl border border-line bg-white p-4 text-center ${one.active ? '' : 'opacity-40'}`}>
              <div className="[&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: one.svg }} />
              <p className="mt-2 text-sm text-muted">{venue.name}</p><p className="text-2xl font-extrabold">{one.label}</p>
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {!one.active && <Pill tone="bad">Switched off</Pill>}{one.codeReplacedAt && <Pill>Code replaced {timeAgo(one.codeReplacedAt)}</Pill>}
            </div>
            <Field label="Link inside this QR (also write this to the NFC tag)" className="mt-4">
              <div className="flex gap-2"><input readOnly value={one.url} className={`${inputCls} font-mono text-xs`} onFocus={e => e.target.select()} />
                <Btn tone="outline" onClick={() => navigator.clipboard.writeText(one.url).then(() => toast('Link copied'), () => toast('Select the link and copy it', 'bad'))}><Copy size={16} /></Btn></div>
            </Field>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <a href={one.png} download={`QR-${one.areaName}-${one.label}.png`}><Btn tone="outline" className="w-full"><Download size={16} />Download PNG</Btn></a>
              <a href={`/print/qr/${venue.id}?spot=${one.id}`} target="_blank" rel="noopener"><Btn tone="outline" className="w-full"><Printer size={16} />Print sticker</Btn></a>
              <a href={one.url} target="_blank" rel="noopener"><Btn tone="outline" className="w-full"><ExternalLink size={16} />Open as customer</Btn></a>
              <Btn tone="outline" onClick={power}><Power size={16} />{one.active ? 'Switch off' : 'Switch on'}</Btn>
            </div>
            <Btn tone="danger" className="mt-2 w-full" onClick={replace}><RefreshCcw size={16} />Replace code (old sticker stops working)</Btn>
          </div>
        )}
      </Sheet>

      <AddArea open={adding} venue={venue} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />
    </div>
  );
}

function AddArea({ open, venue, onClose, onDone }: { open: boolean; venue: VenueCtx; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const theater = venue.serviceMode === 'seat_delivery';
  const [kind, setKind] = useState<'screen' | 'tables' | 'counter'>(theater ? 'screen' : 'tables');
  const [name, setName] = useState('');
  const [rows, setRows] = useState('A-J');
  const [per, setPer] = useState('14');
  const [labels, setLabels] = useState('1-10');
  const expand = (s: string) => s.split(',').flatMap(p => { const m = p.trim().match(/^([A-Za-z]*)(\d+)-\1?(\d+)$/); if (m) { const out = []; for (let i = +m[2]; i <= +m[3] && out.length < 200; i++) out.push(`${m[1]}${i}`); return out; } return p.trim() ? [p.trim()] : []; });
  const count = kind === 'screen' ? (rows.match(/^([A-Z])-([A-Z])$/i) ? (rows.toUpperCase().charCodeAt(2) - rows.toUpperCase().charCodeAt(0) + 1) * Number(per || 0) : 0) : kind === 'tables' ? expand(labels).length : 1;
  const save = async () => {
    const ok = await confirm({ title: `Create ${count} QR code${count > 1 ? 's' : ''}?`, body: `For “${name || 'new area'}”. You can print the stickers right after.`, confirm: 'Create', tone: 'primary' });
    if (!ok) return;
    try {
      await api(`/api/staff/v/${venue.id}/spots`, { body: { name, kind, rows: kind === 'screen' ? rows.toUpperCase() : undefined, seatsPerRow: kind === 'screen' ? Number(per) : undefined, labels: kind === 'tables' ? expand(labels) : undefined } });
      toast('QR codes created'); onDone();
    } catch (e) { toast((e as Error).message, 'bad'); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add seats, tables or a counter" footer={<Btn tone="dark" className="w-full" disabled={!name || !count} onClick={save}>Create {count || ''} QR code{count === 1 ? '' : 's'}</Btn>}>
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-2">
          {([['screen', 'Screen (seats)'], ['tables', 'Tables'], ['counter', 'Counter QR']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setKind(k)} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${kind === k ? 'border-ink bg-ink text-white' : 'border-line'}`}>{l}</button>
          ))}
        </div>
        <Field label="Name"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder={kind === 'screen' ? 'Screen 3' : kind === 'tables' ? 'Rooftop' : 'Main counter'} /></Field>
        {kind === 'screen' && <div className="grid grid-cols-2 gap-3"><Field label="Rows" hint="e.g. A-J"><input className={inputCls} value={rows} onChange={e => setRows(e.target.value)} /></Field><Field label="Seats per row"><input className={inputCls} inputMode="numeric" value={per} onChange={e => setPer(e.target.value.replace(/\D/g, ''))} /></Field></div>}
        {kind === 'tables' && <Field label="Table numbers" hint="Ranges and lists both work: 1-12 or T1-T6 or 1, 2, 5A"><input className={inputCls} value={labels} onChange={e => setLabels(e.target.value)} /></Field>}
      </div>
    </Sheet>
  );
}

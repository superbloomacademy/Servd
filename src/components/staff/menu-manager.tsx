'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, rupee, shrinkImage } from '@/lib/client';
import { Btn, Field, Pill, Sheet, Toggle, VegMark, inputCls } from '@/components/ui/kit';
import { useConfirm, useToast } from '@/components/ui/providers';
import { FoodArt } from '@/components/food-art';
import { PageHead } from './shell';
import type { VenueCtx } from './types';

type Cat = { id: string; name: string; isLive: boolean };
type Station = { id: string; name: string; isLive: boolean };
type Item = { id: string; categoryId: string; stationId: string | null; name: string; description: string; pricePaise: number; veg: boolean; imageUrl: string | null; isLive: boolean; tags: string[] };
const TAGS = [['bestseller', 'Bestseller'], ['must_try', 'Must try'], ['new', 'New'], ['spicy', 'Spicy']] as const;

export function MenuManager({ venue }: { venue: VenueCtx }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [cats, setCats] = useState<Cat[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [edit, setEdit] = useState<Partial<Item> | null>(null);

  const load = useCallback(async () => {
    const r = await api<{ categories: Cat[]; items: Item[]; stations: Station[] }>(`/api/staff/v/${venue.id}/menu`);
    setCats(r.categories); setItems(r.items); setStations(r.stations);
  }, [venue.id]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (kind: 'item' | 'category' | 'station', row: { id: string; name: string; isLive: boolean }) => {
    const what = kind === 'item' ? row.name : kind === 'category' ? `the whole “${row.name}” category` : `${row.name} (all its items)`;
    const ok = await confirm({
      title: row.isLive ? `Turn off ${what}?` : `Turn ${what} back on?`,
      body: row.isLive ? 'Customers see it as “Sold out” and can’t order it until you turn it back on.' : 'Customers can order it again immediately.',
      confirm: row.isLive ? 'Turn off' : 'Turn on', tone: row.isLive ? 'danger' : 'primary',
    });
    if (!ok) return;
    try { await api(`/api/staff/menu/${kind}/${row.id}`, { method: 'PATCH', body: { isLive: !row.isLive } }); toast(row.isLive ? `${row.name} turned off` : `${row.name} is live`); load(); }
    catch (e) { toast((e as Error).message, 'bad'); }
  };
  const addNamed = async (type: 'category' | 'station') => {
    const r = await confirm({ title: type === 'category' ? 'Add a category' : 'Add a kitchen station', body: type === 'station' ? 'A station gets its own KOT screen and printer, e.g. “Bar” or “Tandoor”.' : undefined,
      confirm: 'Add', tone: 'primary', input: { label: 'Name', placeholder: type === 'category' ? 'e.g. Desserts' : 'e.g. Bar', required: true } });
    if (!r) return;
    try { await api(`/api/staff/v/${venue.id}/menu`, { body: { type, name: r.value } }); toast(`${r.value} added`); load(); }
    catch (e) { toast((e as Error).message, 'bad'); }
  };

  return (
    <div>
      <PageHead title="Menu" sub="Switch anything off when it runs out. Customers see the change within a second."
        right={<><Btn tone="outline" onClick={() => addNamed('category')}><Plus size={16} />Category</Btn><Btn tone="dark" onClick={() => setEdit({ veg: true, tags: [], categoryId: cats[0]?.id, stationId: stations[0]?.id ?? null })}><Plus size={16} />Add item</Btn></>} />

      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {cats.map(c => {
            const list = items.filter(i => i.categoryId === c.id);
            return (
              <section key={c.id} className="rounded-2xl bg-white">
                <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                  <h2 className={`font-bold ${c.isLive ? '' : 'text-faint'}`}>{c.name} <span className="font-normal text-muted">({list.length})</span></h2>
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted">{c.isLive ? 'Live' : 'Off'}<Toggle on={c.isLive} onChange={() => toggle('category', c)} label={`${c.name} live`} /></div>
                </div>
                <ul className="divide-y divide-line">
                  {list.map(it => (
                    <li key={it.id} className="flex items-center gap-3 px-4 py-3">
                      <FoodArt name={it.name} category={c.name} imageUrl={it.imageUrl} size={48} className={`!rounded-xl ${it.isLive ? '' : 'grayscale opacity-60'}`} />
                      <div className="min-w-0 flex-1">
                        <p className={`flex items-center gap-2 font-semibold ${it.isLive ? '' : 'text-faint'}`}><VegMark veg={it.veg} size={12} /><span className="truncate">{it.name}</span></p>
                        <p className="tabular text-sm text-muted">{rupee(it.pricePaise)} · {stations.find(s => s.id === it.stationId)?.name || 'No station'}{it.tags.length ? ` · ${it.tags.join(', ').replace('_', ' ')}` : ''}</p>
                      </div>
                      {!it.isLive && <Pill tone="bad">Sold out</Pill>}
                      <Toggle on={it.isLive} onChange={() => toggle('item', it)} label={`${it.name} live`} />
                      <button onClick={() => setEdit(it)} className="rounded-lg p-2 text-muted hover:bg-soft" aria-label={`Edit ${it.name}`}><Pencil size={16} /></button>
                    </li>
                  ))}
                  {!list.length && <li className="px-4 py-4 text-sm text-muted">No items yet.</li>}
                </ul>
              </section>
            );
          })}
        </div>
        <aside className="h-fit rounded-2xl bg-white p-4">
          <div className="flex items-center justify-between"><h2 className="font-bold">Kitchen stations</h2><button onClick={() => addNamed('station')} className="text-sm font-semibold text-brand-text">+ Add</button></div>
          <p className="mt-1 mb-3 text-xs text-muted">Each item prints on its station’s KOT. Turning a station off marks all its items sold out (e.g. bar closed).</p>
          <ul className="divide-y divide-line">
            {stations.map(s => (
              <li key={s.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm font-semibold">{s.name} <span className="font-normal text-muted">· {items.filter(i => i.stationId === s.id).length} items</span></span>
                <Toggle on={s.isLive} onChange={() => toggle('station', s)} label={`${s.name} live`} />
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <ItemEditor open={!!edit} item={edit} cats={cats} stations={stations} venueId={venue.id} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />
    </div>
  );
}

function ItemEditor({ open, item, cats, stations, venueId, onClose, onSaved }: {
  open: boolean; item: Partial<Item> | null; cats: Cat[]; stations: Station[]; venueId: string; onClose: () => void; onSaved: () => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [f, setF] = useState<Partial<Item> & { price?: string }>({});
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (item) setF({ ...item, price: item.pricePaise ? String(item.pricePaise / 100) : '' }); }, [item]);
  if (!item) return null;
  const isNew = !item.id;

  const upload = async (fl: File) => {
    const fd = new FormData(); fd.append('file', await shrinkImage(fl));
    try { const r = await api<{ url: string }>('/api/staff/upload', { form: fd }); setF(x => ({ ...x, imageUrl: r.url })); }
    catch (e) { toast((e as Error).message, 'bad'); }
  };
  const save = async () => {
    const pricePaise = Math.round(Number(f.price) * 100);
    if (!f.name || !(pricePaise >= 100)) { toast('Enter a name and a price', 'bad'); return; }
    if (!isNew && item.pricePaise !== pricePaise) {
      const ok = await confirm({ title: `Change the price of ${f.name}?`, body: <>From <b>{rupee(item.pricePaise!)}</b> to <b>{rupee(pricePaise)}</b>. Customers see the new price immediately.</>, confirm: 'Change price', tone: 'primary' });
      if (!ok) return;
    }
    setBusy(true);
    const body = { name: f.name, description: f.description || '', pricePaise, veg: !!f.veg, categoryId: f.categoryId, stationId: f.stationId || null, imageUrl: f.imageUrl || null, tags: f.tags || [] };
    try {
      if (isNew) await api(`/api/staff/v/${venueId}/menu`, { body: { type: 'item', ...body } });
      else await api(`/api/staff/menu/item/${item.id}`, { method: 'PATCH', body });
      toast(isNew ? `${f.name} added` : 'Saved'); onSaved();
    } catch (e) { toast((e as Error).message, 'bad'); } finally { setBusy(false); }
  };
  const del = async () => {
    const ok = await confirm({ title: `Delete ${item.name}?`, body: 'It disappears from the menu. Past orders keep their details. This can’t be undone; to hide it for today, turn it off instead.', confirm: 'Delete item', tone: 'danger' });
    if (!ok) return;
    try { await api(`/api/staff/menu/item/${item.id}`, { method: 'DELETE' }); toast('Item deleted'); onSaved(); } catch (e) { toast((e as Error).message, 'bad'); }
  };

  return (
    <Sheet open={open} onClose={onClose} title={isNew ? 'Add item' : `Edit ${item.name}`} wide
      footer={<div className="flex gap-2">{!isNew && <Btn tone="danger" onClick={del}><Trash2 size={16} />Delete</Btn>}<Btn tone="outline" className="ml-auto" onClick={onClose}>Cancel</Btn><Btn tone="dark" loading={busy} onClick={save}>Save</Btn></div>}>
      <div className="grid gap-4 p-4 sm:grid-cols-[140px_1fr]">
        <div>
          <button type="button" onClick={() => file.current?.click()} className="group relative block" aria-label="Upload photo">
            <FoodArt name={f.name || ''} imageUrl={f.imageUrl} size={140} />
            <span className="absolute inset-0 grid place-items-center rounded-2xl bg-black/40 text-sm font-semibold text-white opacity-0 transition group-hover:opacity-100"><span className="flex items-center gap-1"><ImagePlus size={16} />Photo</span></span>
          </button>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
          <p className="mt-2 text-xs text-muted">Square photo, under 3 MB.</p>
          {f.imageUrl && <button onClick={() => setF({ ...f, imageUrl: null })} className="mt-1 text-xs font-semibold text-bad">Remove photo</button>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2"><input className={inputCls} value={f.name || ''} onChange={e => setF({ ...f, name: e.target.value })} maxLength={80} /></Field>
          <Field label="Price (₹)"><input className={inputCls} inputMode="decimal" value={f.price || ''} onChange={e => setF({ ...f, price: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
          <Field label="Type"><select className={inputCls} value={f.veg ? '1' : '0'} onChange={e => setF({ ...f, veg: e.target.value === '1' })}><option value="1">Veg</option><option value="0">Non-veg</option></select></Field>
          <Field label="Category"><select className={inputCls} value={f.categoryId || ''} onChange={e => setF({ ...f, categoryId: e.target.value })}>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Kitchen station (KOT)"><select className={inputCls} value={f.stationId || ''} onChange={e => setF({ ...f, stationId: e.target.value || null })}><option value="">None</option>{stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Short description" className="sm:col-span-2"><input className={inputCls} value={f.description || ''} onChange={e => setF({ ...f, description: e.target.value })} maxLength={200} placeholder="What makes it good, in one line" /></Field>
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-[13px] font-semibold text-ink-2">Tags</p>
            <div className="flex flex-wrap gap-2">
              {TAGS.map(([k, l]) => {
                const on = (f.tags || []).includes(k);
                return <button key={k} type="button" aria-pressed={on} onClick={() => setF({ ...f, tags: on ? (f.tags || []).filter(t => t !== k) : [...(f.tags || []), k] })}
                  className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${on ? 'border-ink bg-ink text-white' : 'border-line text-ink-2'}`}>{l}</button>;
              })}
            </div>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

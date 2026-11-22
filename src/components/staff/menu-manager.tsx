'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, ImagePlus, Pencil, Plus, Trash2, X, Star } from 'lucide-react';
import { api, rupee, shrinkImage } from '@/lib/client';
import { Btn, Field, Pill, Sheet, Toggle, VegMark, inputCls } from '@/components/ui/kit';
import { useConfirm, useToast } from '@/components/ui/providers';
import { FoodArt } from '@/components/food-art';
import { PageHead } from './shell';
import { MenuImport } from './menu-import';
import type { VenueCtx } from './types';

type Cat = { id: string; name: string; isLive: boolean };
type Station = { id: string; name: string; isLive: boolean };
type Item = { id: string; categoryId: string; stationId: string | null; name: string; description: string; pricePaise: number; veg: boolean; imageUrl: string | null; isLive: boolean; tags: string[]; variants: VariantRow[]; addonGroups: GroupRow[]; shortCode: string; favourite: boolean; stockOff: boolean };
type VariantRow = { id?: string; name: string; pricePaise: number };
type GroupRow = { id?: string; name: string; min: number; max: number; options: { id?: string; name: string; pricePaise: number; veg: boolean }[] };
const TAGS = [['bestseller', 'Bestseller'], ['must_try', 'Must try'], ['new', 'New'], ['spicy', 'Spicy']] as const;

export function MenuManager({ venue }: { venue: VenueCtx }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [cats, setCats] = useState<Cat[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [edit, setEdit] = useState<Partial<Item> | null>(null);
  const [q, setQ] = useState('');
  const [off, setOff] = useState(false);
  const [importing, setImporting] = useState(false);

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
        right={<><Btn tone="outline" onClick={() => setImporting(true)}><FileSpreadsheet size={16} />Upload from Excel</Btn><Btn tone="outline" onClick={() => addNamed('category')}><Plus size={16} />Category</Btn><Btn tone="dark" onClick={() => setEdit({ veg: true, tags: [], categoryId: cats[0]?.id, stationId: stations[0]?.id ?? null })}><Plus size={16} />Add item</Btn></>} />

      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap gap-2"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search dishes or short codes" aria-label="Search dishes" className={`${inputCls} max-w-sm bg-white`} />{items.some(i => !i.isLive) && <button onClick={() => setOff(o => !o)} aria-pressed={off} className={`rounded-xl border px-3.5 text-sm font-semibold ${off ? 'border-ink bg-ink text-white' : 'border-line bg-white'}`}>Switched off ({items.filter(i => !i.isLive).length})</button>}</div>
          {cats.map(c => {
            const list = items.filter(i => i.categoryId === c.id && (!off || !i.isLive) && (!q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase()) || i.shortCode?.toLowerCase() === q.trim().toLowerCase()));
            if (!list.length && (q.trim() || off)) return null;
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
                        <p className={`flex items-center gap-2 font-semibold ${it.isLive ? '' : 'text-faint'}`}><VegMark veg={it.veg} size={12} /><span className="truncate">{it.name}</span>{it.shortCode && <span className="rounded bg-soft px-1.5 text-[11px] font-semibold text-muted">{it.shortCode}</span>}{it.favourite && <Star size={13} className="shrink-0 text-muted" aria-label="Favourite" />}</p>
                        <p className="tabular text-sm text-muted">{it.variants?.length ? it.variants.map(v => `${v.name} ${rupee(v.pricePaise)}`).join(" / ") : rupee(it.pricePaise)} · {stations.find(s => s.id === it.stationId)?.name || 'No station'}{it.tags.length ? ` · ${it.tags.join(', ').replace('_', ' ')}` : ''}</p>
                      </div>
                      {!it.isLive && <Pill tone="bad">{it.stockOff ? 'Out of stock' : 'Sold out'}</Pill>}
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

      <MenuImport open={importing} onClose={() => setImporting(false)} venueId={venue.id} onDone={load} />
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
  const [sizes, setSizes] = useState<SizeF[]>([]);
  const [groups, setGroups] = useState<GroupF[]>([]);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!item) return;
    setF({ ...item, price: item.pricePaise ? String(item.pricePaise / 100) : '' });
    setSizes((item.variants || []).map(v => ({ id: v.id, name: v.name, price: String(v.pricePaise / 100) })));
    setGroups((item.addonGroups || []).map(g => ({ id: g.id, name: g.name, min: String(g.min), max: String(g.max), options: g.options.map(o => ({ id: o.id, name: o.name, price: String(o.pricePaise / 100), veg: o.veg })) })));
  }, [item]);
  if (!item) return null;
  const isNew = !item.id;

  const upload = async (fl: File) => {
    const fd = new FormData(); fd.append('file', await shrinkImage(fl));
    try { const r = await api<{ url: string }>('/api/staff/upload', { form: fd }); setF(x => ({ ...x, imageUrl: r.url })); }
    catch (e) { toast((e as Error).message, 'bad'); }
  };
  const save = async () => {
    const variants = sizes.filter(x => x.name.trim() || x.price).map(x => ({ id: x.id, name: x.name.trim(), pricePaise: Math.round(Number(x.price) * 100) }));
    const addonGroups = groups.map(g => ({ id: g.id, name: g.name.trim(), min: Number(g.min) || 0, max: Number(g.max) || 0,
      options: g.options.filter(o => o.name.trim()).map(o => ({ id: o.id, name: o.name.trim(), pricePaise: Math.round((Number(o.price) || 0) * 100), veg: o.veg })) }));
    const pricePaise = variants.length ? Math.min(...variants.map(v => v.pricePaise || 0)) : Math.round(Number(f.price) * 100);
    if (!f.name || !(pricePaise >= 100)) { toast(variants.length ? 'Give every size a price' : 'Enter a name and a price', 'bad'); return; }
    if (!isNew && item.pricePaise !== pricePaise) {
      const ok = await confirm({ title: `Change the price of ${f.name}?`, body: <>From <b>{rupee(item.pricePaise!)}</b> to <b>{rupee(pricePaise)}</b>. Customers see the new price immediately.</>, confirm: 'Change price', tone: 'primary' });
      if (!ok) return;
    }
    setBusy(true);
    const body = { name: f.name, description: f.description || '', pricePaise, veg: !!f.veg, categoryId: f.categoryId, stationId: f.stationId || null, imageUrl: f.imageUrl || null, tags: f.tags || [], variants, addonGroups, shortCode: f.shortCode || '', favourite: !!f.favourite };
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
          {sizes.length ? <Field label="Price"><p className="py-2.5 text-sm text-muted">Set per size below</p></Field>
            : <Field label="Price (₹)"><input className={inputCls} inputMode="decimal" value={f.price || ''} onChange={e => setF({ ...f, price: e.target.value.replace(/[^\d.]/g, '') })} /></Field>}
          <Field label="Type"><select className={inputCls} value={f.veg ? '1' : '0'} onChange={e => setF({ ...f, veg: e.target.value === '1' })}><option value="1">Veg</option><option value="0">Non-veg</option></select></Field>
          <Field label="Category"><select className={inputCls} value={f.categoryId || ''} onChange={e => setF({ ...f, categoryId: e.target.value })}>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Kitchen station (KOT)"><select className={inputCls} value={f.stationId || ''} onChange={e => setF({ ...f, stationId: e.target.value || null })}><option value="">None</option>{stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Short description" className="sm:col-span-2"><input className={inputCls} value={f.description || ''} onChange={e => setF({ ...f, description: e.target.value })} maxLength={200} placeholder="What makes it good, in one line" /></Field>
          <Field label="Short code for billing" hint="Type it on the billing screen, e.g. BC or 12"><input className={inputCls} value={f.shortCode || ''} onChange={e => setF({ ...f, shortCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) })} /></Field>
          <label className="flex items-center gap-2 self-center text-sm font-semibold"><input type="checkbox" checked={!!f.favourite} onChange={e => setF({ ...f, favourite: e.target.checked })} />Show in Favourites on the billing screen</label>
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
          <OptionsEditor sizes={sizes} setSizes={setSizes} groups={groups} setGroups={setGroups} />
        </div>
      </div>
    </Sheet>
  );
}

type SizeF = { id?: string; name: string; price: string };
type GroupF = { id?: string; name: string; min: string; max: string; options: { id?: string; name: string; price: string; veg: boolean }[] };
type SetS<T> = React.Dispatch<React.SetStateAction<T>>;

// Sizes (Half / Full, Regular / Large) and add-on groups (Extra toppings, Choose your dip).
function OptionsEditor({ sizes, setSizes, groups, setGroups }: { sizes: SizeF[]; setSizes: SetS<SizeF[]>; groups: GroupF[]; setGroups: SetS<GroupF[]> }) {
  const small = 'rounded-lg border border-line px-2.5 py-1.5 text-sm outline-none focus:border-ink';
  const money = (v: string) => v.replace(/[^\d.]/g, '');
  const setG = (gi: number, f: (g: GroupF) => GroupF) => setGroups(s => s.map((y, k) => (k === gi ? f(y) : y)));
  const setO = (gi: number, oi: number, f: (o: GroupF['options'][number]) => GroupF['options'][number]) => setG(gi, g => ({ ...g, options: g.options.map((z, j) => (j === oi ? f(z) : z)) }));
  return (
    <div className="space-y-4 border-t border-line pt-4 sm:col-span-2">
      <div>
        <p className="text-[13px] font-semibold text-ink-2">Sizes <span className="font-normal text-muted">· e.g. Half / Full. Leave empty for one price.</span></p>
        {sizes.map((x, i) => (
          <div key={i} className="mt-2 flex items-center gap-2">
            <input value={x.name} onChange={e => setSizes(s => s.map((y, k) => (k === i ? { ...y, name: e.target.value } : y)))} placeholder="Size name" aria-label="Size name" className={`${small} flex-1`} maxLength={30} />
            <span className="text-sm text-muted">₹</span>
            <input value={x.price} onChange={e => setSizes(s => s.map((y, k) => (k === i ? { ...y, price: money(e.target.value) } : y)))} inputMode="decimal" placeholder="Price" aria-label="Size price" className={`${small} w-24`} />
            <button type="button" onClick={() => setSizes(s => s.filter((_, k) => k !== i))} className="rounded-lg p-1.5 text-muted hover:bg-soft" aria-label="Remove size"><X size={15} /></button>
          </div>
        ))}
        <button type="button" onClick={() => setSizes(s => [...s, ...(s.length ? [{ name: '', price: '' }] : [{ name: 'Half', price: '' }, { name: 'Full', price: '' }])])}
          className="mt-2 flex items-center gap-1 text-sm font-semibold text-brand-text"><Plus size={14} />{sizes.length ? 'Add size' : 'Add sizes (Half / Full)'}</button>
      </div>
      <div>
        <p className="text-[13px] font-semibold text-ink-2">Add-ons <span className="font-normal text-muted">· e.g. Extra cheese +₹30, Choose a dip</span></p>
        {groups.map((g, gi) => (
          <div key={gi} className="mt-2 rounded-xl border border-line p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input value={g.name} onChange={e => setG(gi, y => ({ ...y, name: e.target.value }))} placeholder="Group name, e.g. Extra toppings" aria-label="Add-on group name" className={`${small} min-w-40 flex-1`} maxLength={40} />
              <label className="flex items-center gap-1 text-xs text-muted">Min<input value={g.min} onChange={e => setG(gi, y => ({ ...y, min: e.target.value.replace(/\D/g, '') }))} inputMode="numeric" className={`${small} w-12`} /></label>
              <label className="flex items-center gap-1 text-xs text-muted">Max<input value={g.max} onChange={e => setG(gi, y => ({ ...y, max: e.target.value.replace(/\D/g, '') }))} inputMode="numeric" className={`${small} w-12`} /></label>
              <button type="button" onClick={() => setGroups(s => s.filter((_, k) => k !== gi))} className="rounded-lg p-1.5 text-muted hover:bg-soft" aria-label="Remove group"><X size={15} /></button>
            </div>
            {g.options.map((o, oi) => (
              <div key={oi} className="mt-2 flex items-center gap-2 pl-2">
                <button type="button" onClick={() => setO(gi, oi, z => ({ ...z, veg: !z.veg }))} aria-label={o.veg ? 'Veg (tap for non-veg)' : 'Non-veg (tap for veg)'}><VegMark veg={o.veg} size={13} /></button>
                <input value={o.name} onChange={e => setO(gi, oi, z => ({ ...z, name: e.target.value }))} placeholder="Choice" aria-label="Add-on name" className={`${small} flex-1`} maxLength={40} />
                <span className="text-sm text-muted">+₹</span>
                <input value={o.price} onChange={e => setO(gi, oi, z => ({ ...z, price: money(e.target.value) }))} inputMode="decimal" placeholder="0" aria-label="Add-on price" className={`${small} w-20`} />
                <button type="button" onClick={() => setG(gi, y => ({ ...y, options: y.options.filter((_, j) => j !== oi) }))} className="rounded-lg p-1.5 text-muted hover:bg-soft" aria-label="Remove choice"><X size={14} /></button>
              </div>
            ))}
            <button type="button" onClick={() => setG(gi, y => ({ ...y, options: [...y.options, { name: '', price: '', veg: true }] }))} className="mt-2 ml-2 flex items-center gap-1 text-xs font-semibold text-brand-text"><Plus size={13} />Add choice</button>
          </div>
        ))}
        <button type="button" onClick={() => setGroups(s => [...s, { name: '', min: '0', max: '', options: [{ name: '', price: '', veg: true }] }])} className="mt-2 flex items-center gap-1 text-sm font-semibold text-brand-text"><Plus size={14} />Add add-on group</button>
        <p className="mt-1 text-xs text-muted">Min 0 = optional. Max 1 = pick one (like a choice of dip).</p>
      </div>
    </div>
  );
}

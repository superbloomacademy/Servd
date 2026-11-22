'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, CalendarClock, ChefHat, ClipboardCheck, Pencil, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { api, clock } from '@/lib/client';
import { Btn, Empty, Field, Pill, Sheet, Spinner, Toggle, inputCls } from '@/components/ui/kit';
import { useToast } from '@/components/ui/providers';
import { PageHead } from './shell';
import { money, num, paise, qtyText, Rs, type Inv, type Mat, type Post, type Supplier } from './inv-parts';
import { PurchaseEditor, Purchases, Suppliers, type Draft } from './inv-buying';
import { Batches, Recipes } from './inv-recipes';
import { Counting, StockReports, Transfers } from './inv-control';
import type { MenuData, VenueCtx } from './types';

type Tab = 'today' | 'materials' | 'buy' | 'recipes' | 'batches' | 'count' | 'reports' | 'suppliers' | 'transfers';
const TABS: [Tab, string][] = [['today', 'To do'], ['materials', 'Materials'], ['buy', 'Purchases'], ['recipes', 'Recipes'], ['batches', 'Kitchen batches'], ['count', 'Stock count'], ['reports', 'Reports'], ['suppliers', 'Suppliers'], ['transfers', 'Branches']];
const UNITS = ['kg', 'g', 'l', 'ml', 'pcs', 'pack', 'dozen'];
const WASTE = ['Spoiled', 'Dropped / spilled', 'Overcooked', 'Returned by guest', 'Expired', 'Staff meal'];
const KIND: Record<string, string> = { purchase: 'Purchase', wastage: 'Wastage', adjust: 'Opening', count: 'Count', made: 'Made', used: 'Used in batch', sent: 'Branch transfer', arrived: 'From branch' };

// Inventory: what needs doing, then every step from buying to counting. Stock goes down by recipe with every order.
export function Inventory({ venue }: { venue: VenueCtx }) {
  const toast = useToast();
  const [inv, setInv] = useState<Inv | null>(null);
  const [menu, setMenu] = useState<MenuData | null>(null);
  const [tab, setTab] = useState<Tab>('today');
  const [edit, setEdit] = useState<Partial<Mat> | null>(null);
  const [waste, setWaste] = useState<Mat | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [q, setQ] = useState('');
  const [showOff, setShowOff] = useState(false);

  const load = useCallback(async () => {
    try {
      const [i, m] = await Promise.all([api<Inv>(`/api/staff/v/${venue.id}/inventory`), api<MenuData>(`/api/staff/v/${venue.id}/menu`)]);
      setInv(i); setMenu(m);
    } catch (e) { toast((e as Error).message, 'bad'); }
  }, [venue.id, toast]);
  useEffect(() => { load(); }, [load]);
  const post: Post = async (b, ok) => {
    try { const r = await api(`/api/staff/v/${venue.id}/inventory`, { body: b }); if (ok) toast(ok); await load(); return r; }
    catch (e) { const x = e as Error & { code?: string }; toast(x.message, 'bad'); return x.code === 'DUPLICATE_BILL' ? 'DUPLICATE_BILL' : null; }
  };
  const cats = useMemo(() => [...new Set((inv?.items ?? []).map(i => i.category).filter(Boolean))].sort(), [inv]);
  if (!inv || !menu) return <div className="grid place-items-center py-24"><Spinner className="text-muted" /></div>;

  const active = inv.items.filter(i => i.active);
  const low = active.filter(i => (i.low || i.out) && i.kind === 'raw'), prepLow = active.filter(i => (i.low || i.out) && i.kind === 'prep');
  const late = inv.purchases.filter(p => p.status === 'ordered' || p.status === 'part');
  const noRecipe = menu.items.filter(i => i.isLive && !inv.recipes.some(r => r.itemId === i.id && !r.addonId));
  const negative = active.filter(i => i.qty < -1e-9);
  const order = (list: Mat[]) => setDraft({ supplierId: list.every(m => m.supplierId === list[0]?.supplierId) ? list[0]?.supplierId ?? '' : '', lines: list.map(m => ({ id: m.id, qty: m.suggest ? (m.buyUnit ? Math.max(1, Math.ceil(m.suggest / m.buyFactor)) : m.suggest) : 0, buy: !!m.buyUnit })) });
  const shown = inv.items.filter(m => (m.active || showOff) && (!q || (m.name + m.category).toLowerCase().includes(q.toLowerCase())));
  const groups = [...new Set(shown.map(m => m.category || 'Other'))].sort();
  const todo = low.length + prepLow.length + inv.expiring.length + late.length + negative.length;

  return (
    <div>
      <PageHead title="Inventory" sub={<>Stock value <b className="text-ink">{money(inv.valuePaise)}</b> · you owe suppliers <b className="text-ink">{money(inv.owedPaise)}</b></>}
        right={<><Btn tone="outline" onClick={() => setEdit({ unit: 'kg', kind: 'raw', yieldPct: 100, buyFactor: 1 })}><Plus size={16} />Material</Btn><Btn tone="dark" onClick={() => setDraft({ supplierId: '', lines: [] })}><ShoppingCart size={16} />Buy stock</Btn></>} />
      <div className="no-scrollbar mb-4 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 text-sm font-semibold" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`shrink-0 rounded-lg px-3.5 py-2 ${tab === k ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}>{l}{k === 'today' && todo > 0 && <span className="ml-1.5 rounded-full bg-bad px-1.5 text-[11px] text-white">{todo}</span>}</button>)}
      </div>

      {tab === 'today' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Box icon={<ShoppingCart size={18} />} title="Running low" count={low.length} empty="Nothing needs ordering." action={low.length > 0 && <Btn size="sm" tone="dark" onClick={() => order(low.filter(m => m.suggest > 0 || !m.coming))}>Order all</Btn>}>
            {low.map(m => <Row key={m.id} title={m.name} sub={`${qtyText(m.qty, m.unit)} left${m.daysLeft !== null ? ` · lasts ${m.daysLeft} day${m.daysLeft === 1 ? '' : 's'}` : ''}${m.coming ? ` · ${qtyText(m.coming, m.unit)} on the way` : ''}`} tone={m.out ? 'bad' : 'warn'} pill={m.out ? 'Out' : 'Low'}><Btn size="sm" tone="outline" onClick={() => order([m])}>Order</Btn></Row>)}
          </Box>
          <Box icon={<ChefHat size={18} />} title="Make in the kitchen" count={prepLow.length} empty="No batches needed." action={prepLow.length > 0 && <Btn size="sm" tone="outline" onClick={() => setTab('batches')}>Kitchen batches</Btn>}>
            {prepLow.map(m => <Row key={m.id} title={m.name} sub={`${qtyText(m.qty, m.unit)} left`} tone={m.out ? 'bad' : 'warn'} pill={m.out ? 'Out' : 'Low'} />)}
          </Box>
          <Box icon={<CalendarClock size={18} />} title="Use first (expiring)" count={inv.expiring.length} empty="Nothing expires in the next 3 days.">
            {inv.expiring.map(e => <Row key={e.stockItemId + e.expiry} title={e.name} sub={`${qtyText(e.qty, e.unit)} · ${new Date(e.expiry).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`} tone={e.daysLeft < 0 ? 'bad' : 'warn'} pill={e.daysLeft < 0 ? 'Expired' : e.daysLeft === 0 ? 'Today' : `${e.daysLeft} day${e.daysLeft === 1 ? '' : 's'}`}>{e.daysLeft < 0 && <Btn size="sm" tone="danger" onClick={() => setWaste(inv.items.find(i => i.id === e.stockItemId) ?? null)}>Throw away</Btn>}</Row>)}
          </Box>
          <Box icon={<Boxes size={18} />} title="Deliveries to receive" count={late.length} empty="No orders on the way." action={late.length > 0 && <Btn size="sm" tone="outline" onClick={() => setTab('buy')}>Open purchases</Btn>}>
            {late.map(p => <Row key={p.id} title={`Purchase ${p.number} · ${inv.suppliers.find(s => s.id === p.supplierId)?.name ?? 'No supplier'}`} sub={`${p.lines.length} materials · ${money(p.totalPaise)}${p.expectedOn ? ` · expected ${p.expectedOn}` : ''}`} tone="info" pill={p.status === 'part' ? 'Part arrived' : 'Ordered'} />)}
          </Box>
          {negative.length > 0 && <Box icon={<AlertTriangle size={18} />} title="Below zero: check these" count={negative.length} empty="">{negative.map(m => <Row key={m.id} title={m.name} sub={m.kind === 'prep' ? 'More was sold than you recorded making. Record the batch.' : 'More was sold than you recorded buying. Enter the bill or count it.'} tone="bad" pill={qtyText(m.qty, m.unit)} />)}</Box>}
          {noRecipe.length > 0 && <Box icon={<ClipboardCheck size={18} />} title="Dishes without a recipe" count={noRecipe.length} empty="" action={<Btn size="sm" tone="outline" onClick={() => setTab('recipes')}>Add recipes</Btn>}><p className="py-1 text-sm text-muted">Selling these does not take anything out of stock: {noRecipe.slice(0, 8).map(i => i.name).join(', ')}{noRecipe.length > 8 ? ` and ${noRecipe.length - 8} more` : ''}.</p></Box>}
        </div>
      )}

      {tab === 'materials' && (inv.items.length ? (
        <>
          <label className="mb-3 flex max-w-sm items-center gap-2 rounded-xl border border-line bg-white px-3 focus-within:border-ink"><Search size={16} className="text-muted" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search materials" aria-label="Search materials" className="w-full py-2.5 text-sm outline-none" /></label>
          {groups.map(g => (
            <section key={g} className="mb-4 overflow-x-auto rounded-2xl bg-white">
              <h2 className="px-4 pt-3 font-bold">{g}</h2>
              <table className="w-full min-w-[820px] table-fixed text-sm">
                <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="w-[30%] px-4 py-2">Material</th><th className="text-right">In stock</th><th className="text-right">Used / day</th><th className="text-right">Lasts</th><th className="text-right">Average cost</th><th className="text-right">Value</th><th className="w-[18%] px-4" /></tr></thead>
                <tbody>{shown.filter(m => (m.category || 'Other') === g).map(m => (
                  <tr key={m.id} className={`border-b border-line last:border-0 ${m.active ? '' : 'opacity-50'}`}>
                    <td className="px-4 py-2.5"><b className="font-semibold">{m.name}</b>{m.kind === 'prep' && <Pill tone="info" className="ml-2">Kitchen-made</Pill>}{m.out ? <Pill tone="bad" className="ml-2">Out</Pill> : m.low && <Pill tone="warn" className="ml-2">Low</Pill>}{m.coming > 0 && <span className="block text-xs text-muted">{qtyText(m.coming, m.unit)} on the way</span>}</td>
                    <td className={`tabular text-right font-bold ${m.qty < 0 ? 'text-bad' : ''}`}>{qtyText(m.qty, m.unit)}</td>
                    <td className="tabular text-right text-muted">{m.usedPerDay ? qtyText(m.usedPerDay, m.unit) : '—'}</td>
                    <td className="tabular text-right">{m.daysLeft === null ? '—' : <span className={m.daysLeft < 2 ? 'font-bold text-bad' : ''}>{m.daysLeft} d</span>}</td>
                    <td className="tabular text-right text-muted">{m.avgCost ? `${money(m.avgCost)}/${m.unit}` : '—'}</td>
                    <td className="tabular text-right">{money(Math.max(0, m.qty) * m.avgCost)}</td>
                    <td className="px-4"><div className="flex justify-end gap-1"><Btn size="sm" tone="ghost" onClick={() => setWaste(m)} disabled={m.qty <= 0}><Trash2 size={14} />Waste</Btn><Btn size="sm" tone="ghost" onClick={() => setEdit(m)} aria-label={`Edit ${m.name}`}><Pencil size={14} /></Btn></div></td>
                  </tr>
                ))}</tbody>
              </table>
            </section>
          ))}
          {inv.items.some(m => !m.active) && <button onClick={() => setShowOff(v => !v)} className="text-sm font-semibold text-muted">{showOff ? 'Hide' : 'Show'} {inv.items.filter(m => !m.active).length} not in use</button>}
          <section className="mt-4 rounded-2xl bg-white p-4"><h2 className="font-bold">Latest changes <span className="font-normal text-muted">· sales are not listed one by one</span></h2>
            <ul className="mt-2 divide-y divide-line text-sm">{inv.moves.slice(0, 30).map(m => { const it = inv.items.find(i => i.id === m.stockItemId); return <li key={m.id} className="flex items-center gap-3 py-2"><span className="tabular w-28 shrink-0 text-xs text-muted">{new Date(m.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} {clock(m.at)}</span><span className="min-w-0 flex-1"><b>{it?.name}</b> · {KIND[m.kind] ?? m.kind}<span className="block truncate text-xs text-muted">{[m.note, m.supplier, m.staffName].filter(Boolean).join(' · ')}</span></span><span className={`tabular font-bold ${m.qty < 0 ? 'text-bad' : 'text-good'}`}>{m.qty > 0 ? '+' : ''}{qtyText(m.qty, it?.unit ?? '')}</span></li>; })}</ul></section>
        </>
      ) : <div className="rounded-2xl bg-white"><Empty icon={<Boxes />} title="Start with what you buy">Add materials such as paneer (kg), milk (l) and cups (pcs). Then enter your first bill, and give each dish a recipe.</Empty></div>)}

      {tab === 'buy' && <Purchases inv={inv} post={post} onNew={() => setDraft({ supplierId: '', lines: [] })} />}
      {tab === 'recipes' && <Recipes inv={inv} menu={menu} post={post} />}
      {tab === 'batches' && <Batches inv={inv} post={post} onNew={() => setEdit({ unit: 'kg', kind: 'prep', yieldPct: 100, buyFactor: 1 })} />}
      {tab === 'count' && <Counting venueId={venue.id} inv={inv} post={post} />}
      {tab === 'reports' && <StockReports venueId={venue.id} />}
      {tab === 'suppliers' && <Suppliers venueId={venue.id} inv={inv} post={post} />}
      {tab === 'transfers' && <Transfers venueId={venue.id} inv={inv} post={post} />}

      <MaterialSheet m={edit} cats={cats} suppliers={inv.suppliers} onClose={() => setEdit(null)} onSave={async b => { if (await post({ action: 'item', ...b }, b.id ? 'Saved' : 'Material added')) { setEdit(null); if (!b.id && b.kind === 'prep') setTab('batches'); } }} />
      <WasteSheet m={waste} onClose={() => setWaste(null)} onSave={async (qty, note) => { if (await post({ action: 'move', kind: 'wastage', stockItemId: waste!.id, qty, note }, 'Wastage recorded')) setWaste(null); }} />
      <PurchaseEditor draft={draft} inv={inv} post={post} onClose={() => setDraft(null)} onDone={() => { setDraft(null); setTab('buy'); }} />
    </div>
  );
}

function Box({ icon, title, count, empty, action, children }: { icon: React.ReactNode; title: string; count: number; empty: string; action?: React.ReactNode; children?: React.ReactNode }) {
  return <section className="rounded-2xl bg-white p-4"><div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-bold">{icon}{title}{count > 0 && <span className="text-muted">{count}</span>}</h2>{action}</div>{count ? <ul className="mt-2 divide-y divide-line">{children}</ul> : <p className="mt-2 text-sm text-muted">{empty}</p>}</section>;
}
function Row({ title, sub, pill, tone, children }: { title: string; sub: string; pill: string; tone: 'bad' | 'warn' | 'info'; children?: React.ReactNode }) {
  return <li className="flex items-center gap-3 py-2.5 text-sm"><span className="min-w-0 flex-1"><b className="font-semibold">{title}</b><span className="block text-xs text-muted">{sub}</span></span><Pill tone={tone}>{pill}</Pill>{children}</li>;
}

function MaterialSheet({ m, cats, suppliers, onClose, onSave }: { m: Partial<Mat> | null; cats: string[]; suppliers: Supplier[]; onClose: () => void; onSave: (b: Record<string, unknown>) => Promise<void> }) {
  const blank = { name: '', unit: 'kg', kind: 'raw', category: '', lowLevel: '', reorderQty: '', cost: '', qty: '', buyUnit: '', buyFactor: '', yieldPct: '100', shelfDays: '', supplierId: '', autoOff: false, active: true };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (m) setF({ ...blank, name: m.name ?? '', unit: m.unit ?? 'kg', kind: m.kind ?? 'raw', category: m.category ?? '', lowLevel: m.lowLevel ? String(m.lowLevel) : '', reorderQty: m.reorderQty ? String(m.reorderQty) : '', buyUnit: m.buyUnit ?? '', buyFactor: m.buyUnit ? String(m.buyFactor) : '', yieldPct: String(m.yieldPct ?? 100), shelfDays: m.shelfDays ? String(m.shelfDays) : '', supplierId: m.supplierId ?? '', autoOff: !!m.autoOff, active: m.active ?? true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m]);
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const prep = f.kind === 'prep';
  const save = async () => { setBusy(true); await onSave({ id: m?.id, name: f.name, unit: f.unit, kind: f.kind, category: f.category, lowLevel: num(f.lowLevel), reorderQty: num(f.reorderQty), buyUnit: prep ? '' : f.buyUnit, buyFactor: num(f.buyFactor) || 1, yieldPct: num(f.yieldPct) || 100, shelfDays: Math.round(num(f.shelfDays)), supplierId: f.supplierId || null, autoOff: f.autoOff, ...(m?.id ? { active: f.active } : { qty: num(f.qty), costPaise: paise(f.cost) }) }); setBusy(false); };
  return (
    <Sheet open={!!m} onClose={onClose} title={m?.id ? `Edit ${m.name}` : prep ? 'New kitchen-made item' : 'New material'} wide footer={<Btn tone="dark" size="lg" className="w-full" loading={busy} disabled={f.name.trim().length < 2 || (!!f.buyUnit && !num(f.buyFactor))} onClick={save}>Save</Btn>}>
      <div className="grid grid-cols-2 gap-3 p-4">
        <Field label="Name" className="col-span-2"><input autoFocus value={f.name} onChange={set('name')} placeholder={prep ? 'e.g. Makhani gravy' : 'e.g. Paneer'} className={inputCls} /></Field>
        {!m?.id && <div className="col-span-2 flex rounded-xl bg-soft p-1 text-sm font-semibold">{([['raw', 'We buy it'], ['prep', 'We make it in the kitchen']] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setF({ ...f, kind: k })} className={`flex-1 rounded-lg py-2 ${f.kind === k ? 'bg-white shadow-sm' : 'text-muted'}`}>{l}</button>)}</div>}
        <Field label="Stock unit"><select value={f.unit} onChange={set('unit')} className={inputCls}>{UNITS.map(u => <option key={u}>{u}</option>)}</select></Field>
        <Field label="Group"><input value={f.category} onChange={set('category')} list="inv-cats" placeholder="e.g. Dairy" className={inputCls} /><datalist id="inv-cats">{cats.map(c => <option key={c} value={c} />)}</datalist></Field>
        {!prep && <>
          <Field label="Bought in (optional)" hint="e.g. box, sack, tin"><input value={f.buyUnit} onChange={set('buyUnit')} placeholder="box" className={inputCls} /></Field>
          {f.buyUnit && <Field label={`${f.unit} in one ${f.buyUnit}`}><input value={f.buyFactor} onChange={set('buyFactor')} inputMode="decimal" placeholder="e.g. 10" className={inputCls} /></Field>}
          <Field label="Usable after cleaning (%)" hint="Onion 85, fish 60. 100 = all of it."><input value={f.yieldPct} onChange={set('yieldPct')} inputMode="decimal" className={inputCls} /></Field>
          <Field label="Usual supplier"><select value={f.supplierId} onChange={set('supplierId')} className={inputCls}><option value="">Not set</option>{suppliers.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        </>}
        <Field label={`Warn when below (${f.unit})`}><input value={f.lowLevel} onChange={set('lowLevel')} inputMode="decimal" className={inputCls} /></Field>
        {!prep && <Field label={`Then order (${f.unit})`} hint="Empty = we work it out"><input value={f.reorderQty} onChange={set('reorderQty')} inputMode="decimal" className={inputCls} /></Field>}
        <Field label="Keeps for (days)" hint="Empty = don’t track expiry"><input value={f.shelfDays} onChange={set('shelfDays')} inputMode="numeric" className={inputCls} /></Field>
        {!m?.id && !prep && <><Field label={`Stock now (${f.unit})`}><input value={f.qty} onChange={set('qty')} inputMode="decimal" className={inputCls} /></Field><Field label={`Cost per ${f.unit}`}><Rs value={f.cost} onChange={v => setF({ ...f, cost: v })} label="Cost" /></Field></>}
        <div className="col-span-2 flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3 text-sm"><span><b>Switch its dishes off when it runs out</b><span className="block text-xs text-muted">They come back by themselves when stock arrives.</span></span><Toggle on={f.autoOff} onChange={() => setF({ ...f, autoOff: !f.autoOff })} label="Switch dishes off automatically" /></div>
        {m?.id && <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={e => setF({ ...f, active: e.target.checked })} />In use</label>}
      </div>
    </Sheet>
  );
}
function WasteSheet({ m, onClose, onSave }: { m: Mat | null; onClose: () => void; onSave: (qty: number, note: string) => Promise<void> }) {
  const [qty, setQty] = useState(''); const [why, setWhy] = useState('');
  useEffect(() => { setQty(''); setWhy(''); }, [m]);
  return (
    <Sheet open={!!m} onClose={onClose} title={m ? `Wastage · ${m.name}` : ''} footer={<Btn tone="danger" size="lg" className="w-full" disabled={!num(qty) || why.trim().length < 2} onClick={() => onSave(num(qty), why)}>Record {m && num(qty) ? `${qtyText(num(qty), m.unit)} · loses ${money(num(qty) * m.avgCost)}` : 'wastage'}</Btn>}>
      {m && <div className="space-y-3 p-4"><p className="text-sm text-muted">In stock: <b className="text-ink">{qtyText(m.qty, m.unit)}</b></p><Field label={`How much (${m.unit})`}><input autoFocus value={qty} onChange={e => setQty(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" className={inputCls} /></Field><div><p className="text-[13px] font-semibold text-ink-2">Why?</p><div className="mt-2 flex flex-wrap gap-2">{WASTE.map(w => <button key={w} onClick={() => setWhy(w)} aria-pressed={why === w} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${why === w ? 'border-ink bg-ink text-white' : 'border-line text-ink-2'}`}>{w}</button>)}</div><input value={why} onChange={e => setWhy(e.target.value)} placeholder="Or type a reason" className={`${inputCls} mt-2`} /></div></div>}
    </Sheet>
  );
}

'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, ClipboardCheck, PackagePlus, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api, clock, rupee } from '@/lib/client';
import { Btn, Empty, Field, Pill, Sheet, Spinner, VegMark, inputCls } from '@/components/ui/kit';
import { useConfirm, useToast } from '@/components/ui/providers';
import { PageHead } from './shell';
import type { MenuData, VenueCtx } from './types';

type Mat = { id: string; name: string; unit: string; qty: number; lowLevel: number; costPaise: number; active: boolean; usedPerDay: number; daysLeft: number | null; low: boolean };
type Recipe = { id: string; itemId: string; variantId: string | null; stockItemId: string; qty: number };
type Move = { id: number; stockItemId: string; kind: string; qty: number; costPaise: number; supplier: string; note: string; staffName: string; at: string };
type Inv = { items: Mat[]; recipes: Recipe[]; moves: Move[]; valuePaise: number };
const UNITS = ['kg', 'g', 'l', 'ml', 'pcs', 'pack', 'dozen'];
const num = (s: string) => Number(s.replace(/[^\d.-]/g, '')) || 0;
const q = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 });

// Inventory: raw materials, recipes (stock goes down with every sale), purchases, wastage and stock counts.
export function Inventory({ venue }: { venue: VenueCtx }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [inv, setInv] = useState<Inv | null>(null);
  const [menu, setMenu] = useState<MenuData | null>(null);
  const [tab, setTab] = useState<'stock' | 'recipes' | 'history'>('stock');
  const [edit, setEdit] = useState<Partial<Mat> | null>(null);
  const [move, setMove] = useState<{ m: Mat; kind: 'purchase' | 'wastage' | 'count' } | null>(null);
  const [recipeFor, setRecipeFor] = useState<{ itemId: string; variantId: string | null } | null>(null);
  const [showOff, setShowOff] = useState(false);

  const load = useCallback(async () => {
    try {
      const [i, m] = await Promise.all([api<Inv>(`/api/staff/v/${venue.id}/inventory`), api<MenuData>(`/api/staff/v/${venue.id}/menu`)]);
      setInv(i); setMenu(m);
    } catch (e) { toast((e as Error).message, 'bad'); }
  }, [venue.id, toast]);
  useEffect(() => { load(); }, [load]);
  const post = async (b: Record<string, unknown>, ok: string) => {
    try { await api(`/api/staff/v/${venue.id}/inventory`, { body: b }); toast(ok); await load(); return true; } catch (e) { toast((e as Error).message, 'bad'); return false; }
  };

  if (!inv || !menu) return <div className="grid place-items-center py-24"><Spinner className="text-muted" /></div>;
  const low = inv.items.filter(i => i.low && i.active);
  const name = (id: string) => inv.items.find(i => i.id === id);

  return (
    <div>
      <PageHead title="Inventory" sub="Add your raw materials and a recipe for each dish. Stock goes down automatically with every order and comes back if an order or item is cancelled."
        right={<Btn tone="dark" onClick={() => setEdit({ unit: 'kg', lowLevel: 0, costPaise: 0 })}><Plus size={16} />Add material</Btn>} />

      {low.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#F5D7A9] bg-[#FFF8EC] p-4 text-sm text-[#7A4A00]">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" /><div><b>Running low:</b> {low.map(l => `${l.name} (${q(l.qty)} ${l.unit})`).join(', ')}. Buy more or switch the dish off.</div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-white p-1 text-sm font-semibold">
          {([['stock', 'Stock'], ['recipes', 'Recipes'], ['history', 'History']] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-4 py-1.5 ${tab === k ? 'bg-ink text-white' : 'text-muted'}`}>{l}</button>)}
        </div>
        <Pill tone="info">Stock value {rupee(inv.valuePaise)}</Pill>
        <Pill>{inv.items.filter(m => m.active).length} materials</Pill>
      </div>

      {tab === 'stock' && (inv.items.length ? (
        <div className="overflow-x-auto rounded-2xl bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="px-4 py-3">Material</th><th className="text-right">In stock</th><th className="text-right">Low at</th><th className="text-right">Used / day</th><th className="text-right">Lasts</th><th className="text-right">Cost / unit</th><th className="px-4 text-right">Update</th></tr></thead>
            <tbody>
              {inv.items.filter(m => m.active || showOff).map(m => (
                <tr key={m.id} className={`border-b border-line last:border-0 ${m.active ? '' : 'opacity-50'}`}>
                  <td className="px-4 py-3 font-semibold">{m.name}{m.low && <Pill tone="bad" className="ml-2">Low</Pill>}</td>
                  <td className={`tabular text-right font-bold ${m.qty < 0 ? 'text-bad' : ''}`}>{q(m.qty)} {m.unit}</td>
                  <td className="tabular text-right text-muted">{m.lowLevel ? `${q(m.lowLevel)} ${m.unit}` : '—'}</td>
                  <td className="tabular text-right text-muted">{m.usedPerDay ? `${q(m.usedPerDay)} ${m.unit}` : '—'}</td>
                  <td className="tabular text-right">{m.daysLeft == null ? '—' : m.daysLeft < 2 ? <b className="text-bad">{m.daysLeft} d</b> : `${m.daysLeft} d`}</td>
                  <td className="tabular text-right text-muted">{m.costPaise ? rupee(m.costPaise) : '—'}</td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <Btn size="sm" tone="outline" onClick={() => setMove({ m, kind: 'purchase' })}><PackagePlus size={14} />Purchase</Btn>
                      <Btn size="sm" tone="ghost" onClick={() => setMove({ m, kind: 'wastage' })} aria-label={`Wastage ${m.name}`}><Trash2 size={14} /></Btn>
                      <Btn size="sm" tone="ghost" onClick={() => setMove({ m, kind: 'count' })} aria-label={`Count ${m.name}`}><ClipboardCheck size={14} /></Btn>
                      <Btn size="sm" tone="ghost" onClick={() => setEdit(m)} aria-label={`Edit ${m.name}`}><Pencil size={14} /></Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {inv.items.some(m => !m.active) && <button onClick={() => setShowOff(v => !v)} className="w-full border-t border-line py-2.5 text-sm font-semibold text-muted hover:bg-soft">{showOff ? 'Hide' : 'Show'} {inv.items.filter(m => !m.active).length} not in use</button>}
        </div>
      ) : <div className="rounded-2xl bg-white"><Empty icon={<Boxes />} title="No materials yet">Add what you buy, such as paneer (kg), milk (l), buns (pcs) and cups (pcs). Then give each dish a recipe.</Empty></div>)}

      {tab === 'recipes' && (
        <div className="grid gap-4 lg:grid-cols-2">
          {menu.categories.map(c => {
            const its = menu.items.filter(i => i.categoryId === c.id);
            if (!its.length) return null;
            return (
              <section key={c.id} className="rounded-2xl bg-white p-4">
                <h2 className="mb-2 font-bold">{c.name}</h2>
                <ul className="divide-y divide-line">
                  {its.flatMap(i => (i.variants.length ? [{ v: null as null | { id: string; name: string } }, ...i.variants.map(v => ({ v }))] : [{ v: null }]).map(({ v }) => {
                    const lines = inv.recipes.filter(r => r.itemId === i.id && r.variantId === (v?.id ?? null));
                    if (v === null && i.variants.length && !lines.length) return null;
                    return (
                      <li key={i.id + (v?.id ?? '')} className="flex items-center gap-3 py-2.5 text-sm">
                        <VegMark veg={i.veg} size={11} />
                        <span className="min-w-0 flex-1"><b>{i.name}</b>{v && <span className="text-muted"> ({v.name})</span>}{v === null && i.variants.length > 0 && <span className="text-muted"> (all sizes)</span>}
                          <span className="block truncate text-xs text-muted">{lines.length ? lines.map(l => `${q(l.qty)} ${name(l.stockItemId)?.unit} ${name(l.stockItemId)?.name}`).join(' · ') : 'No recipe'}</span></span>
                        <Btn size="sm" tone={lines.length ? 'ghost' : 'outline'} onClick={() => setRecipeFor({ itemId: i.id, variantId: v?.id ?? null })} disabled={!inv.items.length}>{lines.length ? 'Edit' : 'Add recipe'}</Btn>
                      </li>
                    );
                  }))}
                </ul>
              </section>
            );
          })}
          {!inv.items.length && <p className="text-sm text-muted">Add materials first, then recipes.</p>}
        </div>
      )}

      {tab === 'history' && (
        <div className="rounded-2xl bg-white p-4">
          <p className="mb-2 text-xs text-muted">Purchases, wastage and counts (sales are deducted automatically and not listed one by one).</p>
          <ul className="divide-y divide-line text-sm">
            {inv.moves.map(m => {
              const it = name(m.stockItemId);
              return (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  <span className="tabular w-28 shrink-0 text-xs text-muted">{new Date(m.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} {clock(m.at)}</span>
                  <Pill tone={m.kind === 'purchase' ? 'good' : m.kind === 'wastage' ? 'bad' : 'neutral'}>{m.kind === 'adjust' ? 'Count' : m.kind[0].toUpperCase() + m.kind.slice(1)}</Pill>
                  <span className="flex-1"><b>{it?.name}</b>{m.supplier && ` · ${m.supplier}`}{m.note && <span className="text-muted"> · {m.note}</span>}<span className="block text-xs text-muted">by {m.staffName}</span></span>
                  <span className={`tabular font-bold ${m.qty < 0 ? 'text-bad' : 'text-good'}`}>{m.qty > 0 ? '+' : ''}{q(m.qty)} {it?.unit}</span>
                  {m.costPaise > 0 && <span className="tabular w-20 text-right">{rupee(m.costPaise)}</span>}
                </li>
              );
            })}
            {!inv.moves.length && <li className="py-6 text-center text-muted">Nothing yet.</li>}
          </ul>
        </div>
      )}

      <MaterialSheet m={edit} onClose={() => setEdit(null)} onSave={async b => { if (await post({ action: 'item', ...b }, b.id ? 'Saved' : 'Material added')) setEdit(null); }} />
      <MoveSheet mv={move} onClose={() => setMove(null)} onSave={async b => {
        if (move?.kind === 'wastage' && !(await confirm({ title: `Record ${b.qty} ${move.m.unit} of ${move.m.name} as wasted?`, body: 'It is taken out of stock and shows in the history with your name.', confirm: 'Record wastage', tone: 'danger' }))) return;
        if (await post({ action: 'move', stockItemId: move!.m.id, kind: move!.kind, ...b }, 'Stock updated')) setMove(null);
      }} />
      <RecipeSheet target={recipeFor} menu={menu} mats={inv.items} recipes={inv.recipes} onClose={() => setRecipeFor(null)}
        onSave={async lines => { if (await post({ action: 'recipe', itemId: recipeFor!.itemId, variantId: recipeFor!.variantId, lines }, 'Recipe saved')) setRecipeFor(null); }} />
    </div>
  );
}

function MaterialSheet({ m, onClose, onSave }: { m: Partial<Mat> | null; onClose: () => void; onSave: (b: Record<string, unknown>) => void }) {
  const [f, setF] = useState({ name: '', unit: 'kg', lowLevel: '', cost: '', qty: '', active: true });
  useEffect(() => { if (m) setF({ name: m.name ?? '', unit: m.unit ?? 'kg', lowLevel: m.lowLevel ? String(m.lowLevel) : '', cost: m.costPaise ? String(m.costPaise / 100) : '', qty: '', active: m.active ?? true }); }, [m]);
  return (
    <Sheet open={!!m} onClose={onClose} title={m?.id ? `Edit ${m.name}` : 'Add material'}
      footer={<Btn tone="dark" size="lg" className="w-full" disabled={f.name.trim().length < 2}
        onClick={() => onSave({ id: m?.id, name: f.name, unit: f.unit, lowLevel: num(f.lowLevel), costPaise: Math.round(num(f.cost) * 100), ...(m?.id ? { active: f.active } : { qty: num(f.qty) }) })}>Save</Btn>}>
      <div className="grid grid-cols-2 gap-3 p-4">
        <Field label="Name" className="col-span-2"><input autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Paneer" className={inputCls} /></Field>
        <Field label="Unit"><select value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })} className={inputCls}>{UNITS.map(u => <option key={u}>{u}</option>)}</select></Field>
        <Field label={`Cost per ${f.unit} (₹)`}><input value={f.cost} onChange={e => setF({ ...f, cost: e.target.value })} inputMode="decimal" className={inputCls} /></Field>
        <Field label={`Warn when below (${f.unit})`} hint="Shows “Running low”."><input value={f.lowLevel} onChange={e => setF({ ...f, lowLevel: e.target.value })} inputMode="decimal" className={inputCls} /></Field>
        {!m?.id && <Field label={`Stock now (${f.unit})`}><input value={f.qty} onChange={e => setF({ ...f, qty: e.target.value })} inputMode="decimal" className={inputCls} /></Field>}
        {m?.id && <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={e => setF({ ...f, active: e.target.checked })} />In use (untick to hide it)</label>}
      </div>
    </Sheet>
  );
}

function MoveSheet({ mv, onClose, onSave }: { mv: { m: Mat; kind: 'purchase' | 'wastage' | 'count' } | null; onClose: () => void; onSave: (b: { qty: number; costPaise: number; supplier: string; note: string }) => void }) {
  const [f, setF] = useState({ qty: '', cost: '', supplier: '', note: '' });
  useEffect(() => { if (mv) setF({ qty: '', cost: '', supplier: '', note: '' }); }, [mv]);
  if (!mv) return null;
  const { m, kind } = mv;
  const ok = num(f.qty) > 0 || (kind === 'count' && f.qty.trim() !== '');
  return (
    <Sheet open onClose={onClose} title={kind === 'purchase' ? `Purchase · ${m.name}` : kind === 'wastage' ? `Wastage · ${m.name}` : `Count stock · ${m.name}`}
      footer={<Btn tone="dark" size="lg" className="w-full" disabled={!ok || (kind === 'wastage' && !f.note.trim())}
        onClick={() => onSave({ qty: num(f.qty), costPaise: Math.round(num(f.cost) * 100), supplier: f.supplier, note: f.note })}>Save</Btn>}>
      <div className="grid grid-cols-2 gap-3 p-4">
        <p className="col-span-2 text-sm text-muted">In stock now: <b className="text-ink">{q(m.qty)} {m.unit}</b></p>
        <Field label={kind === 'count' ? `Counted (${m.unit})` : `Quantity (${m.unit})`}><input autoFocus value={f.qty} onChange={e => setF({ ...f, qty: e.target.value })} inputMode="decimal" className={inputCls} /></Field>
        {kind === 'purchase' && <Field label="Total paid (₹)"><input value={f.cost} onChange={e => setF({ ...f, cost: e.target.value })} inputMode="decimal" className={inputCls} /></Field>}
        {kind === 'purchase' && <Field label="Supplier" className="col-span-2"><input value={f.supplier} onChange={e => setF({ ...f, supplier: e.target.value })} className={inputCls} /></Field>}
        <Field label={kind === 'wastage' ? 'Why? (required)' : 'Note'} className="col-span-2"><input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder={kind === 'wastage' ? 'e.g. spoiled, dropped' : ''} className={inputCls} /></Field>
        {kind === 'count' && f.qty.trim() !== '' && <p className="col-span-2 rounded-xl bg-soft px-3 py-2 text-sm">Difference: <b>{num(f.qty) - m.qty > 0 ? '+' : ''}{q(num(f.qty) - m.qty)} {m.unit}</b></p>}
      </div>
    </Sheet>
  );
}

function RecipeSheet({ target, menu, mats, recipes, onClose, onSave }: {
  target: { itemId: string; variantId: string | null } | null; menu: MenuData; mats: Mat[]; recipes: Recipe[]; onClose: () => void; onSave: (lines: { stockItemId: string; qty: number }[]) => void;
}) {
  const [lines, setLines] = useState<{ stockItemId: string; qty: string }[]>([]);
  const item = target ? menu.items.find(i => i.id === target.itemId) : null;
  const variant = item?.variants.find(v => v.id === target?.variantId);
  useEffect(() => {
    if (!target) return;
    const cur = recipes.filter(r => r.itemId === target.itemId && r.variantId === target.variantId);
    setLines(cur.length ? cur.map(r => ({ stockItemId: r.stockItemId, qty: String(r.qty) })) : [{ stockItemId: '', qty: '' }]);
  }, [target, recipes]);
  const cost = useMemo(() => lines.reduce((a, l) => a + num(l.qty) * (mats.find(m => m.id === l.stockItemId)?.costPaise ?? 0), 0), [lines, mats]);
  if (!target || !item) return null;
  const price = variant?.pricePaise ?? item.pricePaise;
  const valid = lines.filter(l => l.stockItemId && num(l.qty) > 0);
  return (
    <Sheet open onClose={onClose} title={`Recipe · ${item.name}${variant ? ` (${variant.name})` : ''}`}
      footer={<Btn tone="dark" size="lg" className="w-full" onClick={() => onSave(valid.map(l => ({ stockItemId: l.stockItemId, qty: num(l.qty) })))}>Save recipe</Btn>}>
      <div className="space-y-2 p-4">
        <p className="text-sm text-muted">How much of each material <b>one portion</b> uses{item.variants.length && !variant ? ' (for every size without its own recipe)' : ''}.</p>
        {lines.map((l, i) => {
          const m = mats.find(x => x.id === l.stockItemId);
          return (
            <div key={i} className="flex items-center gap-2">
              <select value={l.stockItemId} onChange={e => setLines(ls => ls.map((x, k) => k === i ? { ...x, stockItemId: e.target.value } : x))} aria-label="Material" className={`${inputCls} flex-1`}>
                <option value="">Choose material…</option>{mats.filter(x => x.active || x.id === l.stockItemId).map(x => <option key={x.id} value={x.id}>{x.name} ({x.unit})</option>)}
              </select>
              <input value={l.qty} onChange={e => setLines(ls => ls.map((x, k) => k === i ? { ...x, qty: e.target.value } : x))} inputMode="decimal" placeholder="Qty" aria-label="Quantity" className={`${inputCls} w-24`} />
              <span className="w-10 text-sm text-muted">{m?.unit}</span>
              <button onClick={() => setLines(ls => ls.filter((_, k) => k !== i))} className="rounded-lg p-2 text-muted hover:bg-soft" aria-label="Remove"><X size={16} /></button>
            </div>
          );
        })}
        <button onClick={() => setLines(ls => [...ls, { stockItemId: '', qty: '' }])} className="flex items-center gap-1.5 py-1 text-sm font-semibold text-brand-text"><Plus size={15} />Add material</button>
        {cost > 0 && <p className="rounded-xl bg-soft px-3 py-2 text-sm">Material cost <b>{rupee(Math.round(cost))}</b> per portion · price {rupee(price)} · food cost <b>{Math.round((cost / price) * 100)}%</b></p>}
      </div>
    </Sheet>
  );
}

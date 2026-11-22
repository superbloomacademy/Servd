'use client';
// Recipes: every dish, size and add-on with its cost and margin. Kitchen batches: gravies, doughs and other things you make.
import { useEffect, useMemo, useState } from 'react';
import { ChefHat, Copy, Plus, Search } from 'lucide-react';
import { Btn, Empty, Pill, Sheet, VegMark, inputCls } from '@/components/ui/kit';
import { useConfirm } from '@/components/ui/providers';
import { Ingredients, QtyBox, lineCost, money, num, qtyText, type Ing, type Inv, type Mat, type Post } from './inv-parts';
import type { MenuData, MenuItemFull } from './types';

type Target = { item: MenuItemFull; variantId: string | null; addonId: string | null; label: string; pricePaise: number };
const targets = (i: MenuItemFull): Target[] => [
  ...(i.variants.length ? i.variants.map(v => ({ item: i, variantId: v.id, addonId: null, label: v.name, pricePaise: v.pricePaise })) : [{ item: i, variantId: null, addonId: null, label: '', pricePaise: i.pricePaise }]),
  ...i.addonGroups.flatMap(g => g.options.map(o => ({ item: i, variantId: null, addonId: o.id, label: `+ ${o.name}`, pricePaise: o.pricePaise }))),
];

export function Recipes({ inv, menu, post }: { inv: Inv; menu: MenuData; post: Post }) {
  const [t, setT] = useState<Target | null>(null);
  const [q, setQ] = useState(''); const [missing, setMissing] = useState(false);
  const lines = (x: Target) => inv.recipes.filter(r => r.itemId === x.item.id && r.variantId === x.variantId && r.addonId === x.addonId);
  // A size without its own recipe uses the dish's general one.
  const eff = (x: Target) => { const own = lines(x); return own.length || x.addonId || !x.variantId ? own : inv.recipes.filter(r => r.itemId === x.item.id && !r.variantId && !r.addonId); };
  const cost = (x: Target) => eff(x).reduce((a, r) => a + lineCost(inv.items.find(m => m.id === r.stockItemId), r.qty), 0);
  const dishes = menu.items.flatMap(targets).filter(x => !x.addonId);
  const done = dishes.filter(x => eff(x).length).length;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 focus-within:border-ink"><Search size={16} className="text-muted" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search dishes" aria-label="Search dishes" className="w-48 py-2.5 text-sm outline-none" /></label>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={missing} onChange={e => setMissing(e.target.checked)} />Only without recipe</label>
        <span className="ml-auto text-sm text-muted"><b className="text-ink">{done}</b> of {dishes.length} dishes have a recipe</span>
      </div>
      {!inv.items.length && <p className="mb-3 rounded-xl bg-[#FFF3E0] px-4 py-3 text-sm text-[#9A5500]">Add your materials first, then recipes.</p>}
      {menu.categories.map(c => {
        const list = menu.items.filter(i => i.categoryId === c.id && (!q || i.name.toLowerCase().includes(q.toLowerCase()))).flatMap(targets).filter(x => !missing || (!x.addonId && !eff(x).length));
        if (!list.length) return null;
        return (
          <section key={c.id} className="mb-4 overflow-x-auto rounded-2xl bg-white">
            <h2 className="px-4 pt-3 font-bold">{c.name}</h2>
            <table className="w-full min-w-[820px] table-fixed text-sm"><thead><tr className="border-b border-line text-left text-xs text-muted"><th className="w-[28%] px-4 py-2">Dish</th><th className="w-[28%]">Ingredients</th><th className="w-[9%] text-right">Cost</th><th className="w-[9%] text-right">Price</th><th className="w-[8%] text-right">Food cost</th><th className="w-[9%] text-right">You keep</th><th className="px-4" /></tr></thead>
              <tbody>{list.map(x => { const ls = eff(x), k = cost(x), pct = ls.length && x.pricePaise ? Math.round(k / x.pricePaise * 100) : null; return (
                <tr key={x.item.id + x.variantId + x.addonId} className="border-b border-line last:border-0">
                  <td className={`px-4 py-2.5 ${x.addonId ? 'pl-9' : ''}`}><span className="flex items-center gap-2">{!x.addonId && <VegMark veg={x.item.veg} size={11} />}<b className="font-semibold">{x.addonId ? x.label : x.item.name}</b>{!x.addonId && x.label && <span className="text-muted">{x.label}</span>}</span></td>
                  <td className="truncate text-xs text-muted">{ls.length ? ls.map(r => { const m = inv.items.find(i => i.id === r.stockItemId); return `${m?.name} ${qtyText(r.qty, m?.unit ?? '')}`; }).join(', ') : x.addonId ? '—' : <Pill tone="warn">No recipe</Pill>}</td>
                  <td className="tabular text-right">{ls.length ? money(k) : '—'}</td><td className="tabular text-right text-muted">{x.pricePaise ? money(x.pricePaise) : 'Free'}</td>
                  <td className="tabular text-right">{pct === null ? '—' : <b className={pct > 45 ? 'text-bad' : pct > 35 ? 'text-warn' : 'text-good'}>{pct}%</b>}</td><td className="tabular text-right">{ls.length ? money(x.pricePaise - k) : '—'}</td>
                  <td className="px-4 text-right"><Btn size="sm" tone={ls.length ? 'ghost' : 'outline'} disabled={!inv.items.length} onClick={() => setT(x)}>{lines(x).length ? 'Edit' : 'Add'}</Btn></td>
                </tr>); })}</tbody></table>
          </section>
        );
      })}
      <RecipeSheet t={t} inv={inv} menu={menu} onClose={() => setT(null)} onSave={async ls => { if (await post({ action: 'recipe', itemId: t!.item.id, variantId: t!.variantId, addonId: t!.addonId, lines: ls }, 'Recipe saved')) setT(null); }} />
    </>
  );
}
function RecipeSheet({ t, inv, menu, onClose, onSave }: { t: Target | null; inv: Inv; menu: MenuData; onClose: () => void; onSave: (l: Ing[]) => Promise<void> }) {
  const [lines, setLines] = useState<Ing[]>([]); const [copy, setCopy] = useState(false); const [busy, setBusy] = useState(false);
  const start = useMemo(() => (t ? inv.recipes.filter(r => r.itemId === t.item.id && r.variantId === t.variantId && r.addonId === t.addonId).map(r => ({ stockItemId: r.stockItemId, qty: r.qty })) : []), [t, inv.recipes]);
  useEffect(() => { setLines(start); setCopy(false); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);
  if (!t) return null;
  const k = lines.reduce((a, l) => a + lineCost(inv.items.find(m => m.id === l.stockItemId), l.qty), 0);
  const pct = t.pricePaise ? Math.round(k / t.pricePaise * 100) : 0;
  const from = menu.items.flatMap(targets).filter(x => !(x.item.id === t.item.id && x.variantId === t.variantId && x.addonId === t.addonId) && inv.recipes.some(r => r.itemId === x.item.id && r.variantId === x.variantId && r.addonId === x.addonId));
  return (
    <Sheet open onClose={onClose} wide title={`${t.item.name}${t.label ? ` · ${t.label}` : ''}`} footer={<div className="flex items-center gap-4"><span className="tabular text-sm"><b className="block text-lg">{money(k)}</b>{t.pricePaise > 0 && <span className={pct > 45 ? 'text-bad' : pct > 35 ? 'text-warn' : 'text-good'}>{pct}% of {money(t.pricePaise)}</span>}</span><Btn tone="dark" size="lg" className="flex-1" loading={busy} disabled={lines.some(l => !l.qty)} onClick={async () => { setBusy(true); await onSave(lines); setBusy(false); }}>{lines.length ? 'Save recipe' : 'Save without recipe'}</Btn></div>}>
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted">What <b className="text-ink">one {t.addonId ? 'add-on' : 'portion'}</b> uses. Type the cleaned quantity; peeling and cutting loss is added by itself.</p>
        <Ingredients lines={lines} setLines={setLines} mats={inv.items} />
        {from.length > 0 && (copy ? <select autoFocus className={inputCls} defaultValue="" aria-label="Copy from" onChange={e => { const x = from[Number(e.target.value)]; if (x) { setLines(inv.recipes.filter(r => r.itemId === x.item.id && r.variantId === x.variantId && r.addonId === x.addonId).map(r => ({ stockItemId: r.stockItemId, qty: r.qty }))); setCopy(false); } }}><option value="">Copy from…</option>{from.map((x, i) => <option key={i} value={i}>{x.item.name} {x.label}</option>)}</select> : <button onClick={() => setCopy(true)} className="flex items-center gap-1.5 text-sm font-semibold text-brand-text"><Copy size={14} />Copy from another dish</button>)}
      </div>
    </Sheet>
  );
}

export function Batches({ inv, post, onNew }: { inv: Inv; post: Post; onNew: () => void }) {
  const [rec, setRec] = useState<Mat | null>(null); const [make, setMake] = useState<Mat | null>(null);
  const preps = inv.items.filter(m => m.kind === 'prep' && m.active);
  const lines = (m: Mat) => inv.prepLines.filter(l => l.prepId === m.id);
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm text-muted">Things you make ahead, like gravy, dough and chutney. Record each batch: its ingredients go out of stock and it comes in at their cost.</p><Btn tone="outline" className="shrink-0 whitespace-nowrap" onClick={onNew}><Plus size={16} />Kitchen-made item</Btn></div>
      {preps.length ? <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{preps.map(m => { const ls = lines(m); return (
        <li key={m.id} className="rounded-2xl bg-white p-4">
          <div className="flex items-start justify-between gap-2"><div><b>{m.name}</b><p className="text-xs text-muted">{m.avgCost ? `${money(m.avgCost)} / ${m.unit}` : 'No cost yet'}{m.shelfDays ? ` · keeps ${m.shelfDays} day${m.shelfDays === 1 ? '' : 's'}` : ''}</p></div><span className={`tabular text-lg font-extrabold ${m.qty < 0 ? 'text-bad' : ''}`}>{qtyText(m.qty, m.unit)}</span></div>
          <p className="mt-2 min-h-8 text-xs text-muted">{ls.length ? `${qtyText(m.batchQty, m.unit)} from ${ls.map(l => { const x = inv.items.find(i => i.id === l.stockItemId); return `${qtyText(l.qty, x?.unit ?? '')} ${x?.name}`; }).join(', ')}` : 'Add its recipe to start recording batches.'}</p>
          <div className="mt-3 flex gap-2"><Btn size="sm" tone="dark" disabled={!ls.length} onClick={() => setMake(m)}><ChefHat size={14} />Made a batch</Btn><Btn size="sm" tone={ls.length ? 'ghost' : 'outline'} onClick={() => setRec(m)}>{ls.length ? 'Recipe' : 'Add recipe'}</Btn></div>
        </li>); })}</ul> : <div className="rounded-2xl bg-white"><Empty icon={<ChefHat />} title="Nothing made in the kitchen yet">Add gravies, marinades or dough so dishes can use them, and their real cost shows in every recipe.</Empty></div>}
      <PrepSheet m={rec} inv={inv} onClose={() => setRec(null)} onSave={async (batchQty, ls) => { if (await post({ action: 'prep', prepId: rec!.id, batchQty, lines: ls }, 'Recipe saved')) setRec(null); }} />
      <MakeSheet m={make} inv={inv} onClose={() => setMake(null)} onSave={async qty => { if (await post({ action: 'produce', prepId: make!.id, qty }, 'Batch recorded')) setMake(null); }} />
    </>
  );
}
function PrepSheet({ m, inv, onClose, onSave }: { m: Mat | null; inv: Inv; onClose: () => void; onSave: (q: number, l: Ing[]) => void }) {
  const [lines, setLines] = useState<Ing[]>([]); const [batch, setBatch] = useState(0);
  useEffect(() => { if (m) { setLines(inv.prepLines.filter(l => l.prepId === m.id).map(l => ({ stockItemId: l.stockItemId, qty: l.qty }))); setBatch(m.batchQty); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m]);
  if (!m) return null;
  const k = lines.reduce((a, l) => a + lineCost(inv.items.find(x => x.id === l.stockItemId), l.qty), 0);
  return <Sheet open onClose={onClose} wide title={`Recipe · ${m.name}`} footer={<Btn tone="dark" size="lg" className="w-full" disabled={!batch || !lines.length || lines.some(l => !l.qty)} onClick={() => onSave(batch, lines)}>Save{batch ? ` · ${money(k / batch)} per ${m.unit}` : ''}</Btn>}><div className="space-y-4 p-4"><div className="flex items-center justify-between gap-3 rounded-xl bg-soft p-3"><span className="text-sm font-semibold">One batch makes</span><QtyBox key={m.id} value={m.batchQty} unit={m.unit} onChange={setBatch} label="One batch makes" /></div><Ingredients lines={lines} setLines={setLines} mats={inv.items} exclude={m.id} /></div></Sheet>;
}
function MakeSheet({ m, inv, onClose, onSave }: { m: Mat | null; inv: Inv; onClose: () => void; onSave: (q: number) => Promise<void> }) {
  const confirm = useConfirm();
  const [qty, setQty] = useState('');
  useEffect(() => { if (m) setQty(String(m.batchQty || '')); }, [m]);
  if (!m) return null;
  const n = num(qty);
  const use = inv.prepLines.filter(l => l.prepId === m.id).map(l => { const x = inv.items.find(i => i.id === l.stockItemId)!; return { x, q: (l.qty / (x.yieldPct / 100)) * n / (m.batchQty || 1) }; });
  const short = use.filter(u => u.q > u.x.qty + 1e-9);
  const go = async () => { if (short.length && !(await confirm({ title: 'Not enough in stock on paper', body: <>{short.map(u => u.x.name).join(', ')} will go below zero. If you really made it, a bill or count is missing.</>, confirm: 'We made it, record it', tone: 'danger' }))) return; await onSave(n); };
  return <Sheet open onClose={onClose} title={`Made a batch · ${m.name}`} footer={<Btn tone="dark" size="lg" className="w-full" disabled={!n} onClick={go}>Record {n ? qtyText(n, m.unit) : 'batch'}</Btn>}><div className="space-y-3 p-4"><label className="block text-[13px] font-semibold text-ink-2">How much did you make ({m.unit})?<input autoFocus value={qty} onChange={e => setQty(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" className={`${inputCls} mt-1.5 text-lg font-bold`} /></label><div className="flex gap-2">{[0.5, 1, 2, 3].map(x => <button key={x} onClick={() => setQty(String(Math.round(m.batchQty * x * 1000) / 1000))} className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold">{x === 1 ? '1 batch' : `${x} batch${x > 1 ? 'es' : ''}`}</button>)}</div><ul className="divide-y divide-line text-sm">{use.map(u => <li key={u.x.id} className="flex justify-between py-2"><span>{u.x.name}{u.x.yieldPct < 100 && <span className="text-muted"> (before cleaning)</span>}</span><span className={`tabular ${u.q > u.x.qty + 1e-9 ? 'font-bold text-bad' : ''}`}>−{qtyText(u.q, u.x.unit)} <span className="font-normal text-muted">of {qtyText(u.x.qty, u.x.unit)}</span></span></li>)}</ul></div></Sheet>;
}

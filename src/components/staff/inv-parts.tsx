'use client';
// Shared pieces of the inventory screens: types, number formats, the "g / kg" quantity box and the ingredient list.
import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { rupee } from '@/lib/client';
import { inputCls } from '@/components/ui/kit';

export type Mat = {
  id: string; name: string; unit: string; qty: number; lowLevel: number; costPaise: number; avgCost: number; kind: 'raw' | 'prep'; category: string; buyUnit: string; buyFactor: number;
  yieldPct: number; batchQty: number; reorderQty: number; shelfDays: number; supplierId: string | null; autoOff: boolean; active: boolean;
  usedPerDay: number; daysLeft: number | null; low: boolean; out: boolean; coming: number; suggest: number;
};
export type Recipe = { id: string; itemId: string; variantId: string | null; addonId: string | null; stockItemId: string; qty: number };
export type PrepLine = { id: string; prepId: string; stockItemId: string; qty: number };
export type Supplier = { id: string; name: string; phone: string; gstin: string; notes: string; active: boolean; billedPaise: number; paidPaise: number; duePaise: number; lastBill: string | null };
export type PLine = { id: string; stockItemId: string; name: string; stockUnit: string; unit: string; factor: number; qty: number; received: number; ratePaise: number; taxBps: number };
export type Purchase = { id: string; number: number; supplierId: string | null; status: 'ordered' | 'part' | 'received' | 'cancelled'; expectedOn: string | null; note: string; createdBy: string; createdAt: string; lines: PLine[]; totalPaise: number; receipts: { id: string; billNo: string; billDate: string; totalPaise: number }[] };
export type Move = { id: number; stockItemId: string; kind: string; qty: number; unitCost: number; costPaise: number; supplier: string; note: string; staffName: string; at: string };
export type Inv = { items: Mat[]; recipes: Recipe[]; prepLines: PrepLine[]; moves: Move[]; suppliers: Supplier[]; purchases: Purchase[]; expiring: { stockItemId: string; name: string; unit: string; qty: number; expiry: string; daysLeft: number }[]; valuePaise: number; owedPaise: number };
export type Post = (b: Record<string, unknown>, ok: string) => Promise<any>;

export const num = (s: string) => { const n = Number(String(s).replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : 0; };
export const paise = (s: string) => Math.round(num(s) * 100);
const fmt = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 });
/** 0.2 kg reads as "200 g": what a cook would say. */
export function qtyText(n: number, unit: string) {
  const a = Math.abs(n);
  if (unit === 'kg' && a > 0 && a < 1) return `${fmt(n * 1000)} g`;
  if (unit === 'l' && a > 0 && a < 1) return `${fmt(n * 1000)} ml`;
  return `${fmt(n)} ${unit}`;
}
export const money = (p: number) => rupee(Math.round(p));
/** Cost of `qty` usable units, cleaning loss included. */
export const lineCost = (m: Mat | undefined, qty: number) => (m ? (qty / (m.yieldPct / 100)) * m.avgCost : 0);
const small: Record<string, string> = { kg: 'g', l: 'ml' };

/** Quantity in the material's unit, typed in g / ml when that is easier. */
export function QtyBox({ value, unit, onChange, label, autoFocus }: { value: number; unit: string; onChange: (n: number) => void; label: string; autoFocus?: boolean }) {
  const sm = small[unit];
  const [u, setU] = useState(sm && value < 1 ? sm : unit);
  const f = u === unit ? 1 : 1000;
  const [text, setText] = useState(value ? String(Math.round(value * f * 1000) / 1000) : '');
  useEffect(() => { setU(sm && value < 1 ? sm : unit); setText(value ? String(Math.round(value * (sm && value < 1 ? 1000 : 1) * 1000) / 1000) : ''); /* a new material was chosen */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit]);
  return (
    <span className="flex shrink-0 items-center rounded-xl border border-line bg-white focus-within:border-ink">
      <input autoFocus={autoFocus} value={text} inputMode="decimal" aria-label={label} placeholder="0" onChange={e => { const t = e.target.value.replace(/[^\d.]/g, ''); setText(t); onChange(num(t) / f); }}
        className="tabular w-20 rounded-xl bg-transparent px-3 py-2.5 text-right font-semibold outline-none" />
      {sm ? (
        <select value={u} aria-label={`${label} unit`} onChange={e => { const nu = e.target.value; setU(nu); onChange(num(text) / (nu === unit ? 1 : 1000)); }} className="rounded-xl bg-transparent py-2.5 pr-1 text-sm text-muted outline-none"><option>{sm}</option><option>{unit}</option></select>
      ) : <span className="w-12 pr-2 text-sm text-muted">{unit}</span>}
    </span>
  );
}

export type Ing = { stockItemId: string; qty: number };
/** Ingredient list with search, live cost per line and total. */
export function Ingredients({ lines, setLines, mats, exclude }: { lines: Ing[]; setLines: (l: Ing[]) => void; mats: Mat[]; exclude?: string }) {
  const [q, setQ] = useState('');
  const pick = useMemo(() => mats.filter(m => m.active && m.id !== exclude && !lines.some(l => l.stockItemId === m.id) && (!q || m.name.toLowerCase().includes(q.toLowerCase()))).slice(0, q ? 8 : 5), [mats, lines, q, exclude]);
  const add = (m: Mat) => { setLines([...lines, { stockItemId: m.id, qty: 0 }]); setQ(''); };
  return (
    <div>
      <ul className="divide-y divide-line">
        {lines.map((l, i) => {
          const m = mats.find(x => x.id === l.stockItemId);
          if (!m) return null;
          return (
            <li key={l.stockItemId} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-32 flex-1"><b className="text-sm">{m.name}</b><span className="block text-xs text-muted">{money(m.avgCost)} / {m.unit}{m.yieldPct < 100 ? ` · ${m.yieldPct}% usable` : ''}{m.kind === 'prep' ? ' · made in kitchen' : ''}</span></span>
              <QtyBox value={l.qty} unit={m.unit} label={`Quantity of ${m.name}`} autoFocus={!l.qty && i === lines.length - 1} onChange={n => setLines(lines.map((x, k) => (k === i ? { ...x, qty: n } : x)))} />
              <span className="tabular w-20 text-right text-sm font-semibold">{l.qty ? money(lineCost(m, l.qty)) : '—'}</span>
              <button type="button" onClick={() => setLines(lines.filter((_, k) => k !== i))} className="rounded-lg p-2 text-muted hover:bg-soft" aria-label={`Remove ${m.name}`}><X size={16} /></button>
            </li>
          );
        })}
      </ul>
      <label className="mt-2 flex items-center gap-2 rounded-xl border border-line px-3 focus-within:border-ink">
        <Search size={16} className="text-muted" /><input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && pick[0]) { e.preventDefault(); add(pick[0]); } }} placeholder="Add an ingredient…" aria-label="Add an ingredient" className="w-full py-2.5 text-sm outline-none" />
      </label>
      {pick.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{pick.map(m => <button key={m.id} type="button" onClick={() => add(m)} className="flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-ink-2 hover:bg-soft"><Plus size={13} />{m.name}</button>)}</div>}
      {q && !pick.length && <p className="mt-2 text-sm text-muted">No material called “{q}”. Add it in Materials first.</p>}
    </div>
  );
}

/** Rupee input. */
export function Rs({ value, onChange, label, className = '' }: { value: string; onChange: (s: string) => void; label: string; className?: string }) {
  return <span className={`flex items-center rounded-xl border border-line bg-white px-3 focus-within:border-ink ${className}`}><span className="text-muted">₹</span><input value={value} inputMode="decimal" aria-label={label} placeholder="0" onChange={e => onChange(e.target.value.replace(/[^\d.]/g, ''))} className="tabular w-full min-w-0 bg-transparent px-1.5 py-2.5 text-right font-semibold outline-none" /></span>;
}
export const input = inputCls;

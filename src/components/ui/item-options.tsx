'use client';
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { rupee } from '@/lib/client';
import { Btn, Sheet, VegMark } from './kit';

export type OptItem = {
  id: string; name: string; veg: boolean; pricePaise: number; description?: string;
  variants: { id: string; name: string; pricePaise: number }[];
  addonGroups: { id: string; name: string; min: number; max: number; options: { id: string; name: string; pricePaise: number; veg: boolean }[] }[];
};
export type Picked = { variantId: string | null; variantName: string | null; addonIds: string[]; addonNames: string[]; unitPaise: number; qty: number };

export const hasOptions = (i: Pick<OptItem, 'variants' | 'addonGroups'>) => i.variants.length > 0 || i.addonGroups.length > 0;
/** "from ₹120" for items with sizes. */
export const fromPrice = (i: Pick<OptItem, 'variants' | 'pricePaise'>) => i.variants.length ? Math.min(...i.variants.map(v => v.pricePaise)) : i.pricePaise;

// Choose a size (Half / Full) and add-ons. Used by the guest menu and the staff billing screen.
export function ItemOptions({ item, open, onClose, onAdd, cta = 'Add item' }: { item: OptItem | null; open: boolean; onClose: () => void; onAdd: (p: Picked) => void; cta?: string }) {
  const [variant, setVariant] = useState<string | null>(null);
  const [addons, setAddons] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  useEffect(() => { if (open && item) { setVariant(item.variants[0]?.id ?? null); setAddons([]); setQty(1); } }, [open, item]);
  if (!item) return null;

  const v = item.variants.find(x => x.id === variant) ?? null;
  const chosen = item.addonGroups.flatMap(g => g.options.filter(o => addons.includes(o.id)));
  const unit = (v ? v.pricePaise : item.pricePaise) + chosen.reduce((a, o) => a + o.pricePaise, 0);
  const missing = item.addonGroups.find(g => g.options.filter(o => addons.includes(o.id)).length < g.min);
  const toggle = (g: OptItem['addonGroups'][number], id: string) => setAddons(cur => {
    if (cur.includes(id)) return cur.filter(x => x !== id);
    const inGroup = cur.filter(x => g.options.some(o => o.id === x));
    if (g.max === 1) return [...cur.filter(x => !inGroup.includes(x)), id];      // behaves like a radio
    if (g.max && inGroup.length >= g.max) return cur;
    return [...cur, id];
  });

  return (
    <Sheet open={open} onClose={onClose} title={<span className="flex items-center gap-2"><VegMark veg={item.veg} />{item.name}</span>}
      footer={
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-xl border border-line">
            <button onClick={() => setQty(q => Math.max(1, q - 1))} className="px-3.5 py-2.5 text-lg font-bold" aria-label="Less">−</button>
            <span className="tabular w-6 text-center font-bold">{qty}</span>
            <button onClick={() => setQty(q => Math.min(30, q + 1))} className="px-3.5 py-2.5 text-lg font-bold" aria-label="More">+</button>
          </div>
          <Btn tone="brand" size="lg" className="flex-1" disabled={!!missing || (item.variants.length > 0 && !v)}
            onClick={() => { onAdd({ variantId: v?.id ?? null, variantName: v?.name ?? null, addonIds: chosen.map(o => o.id), addonNames: chosen.map(o => o.name), unitPaise: unit, qty }); onClose(); }}>
            {missing ? `Choose ${missing.name.toLowerCase()}` : `${cta} · ${rupee(unit * qty)}`}
          </Btn>
        </div>
      }>
      <div className="space-y-5 p-4">
        {item.description && <p className="text-sm text-muted">{item.description}</p>}
        {item.variants.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Size <span className="font-normal text-muted">· choose 1</span></legend>
            <div className="divide-y divide-line rounded-xl border border-line">
              {item.variants.map(x => (
                <label key={x.id} className="flex cursor-pointer items-center gap-3 px-3.5 py-3">
                  <input type="radio" name="variant" checked={variant === x.id} onChange={() => setVariant(x.id)} className="h-4 w-4 accent-[var(--brand)]" />
                  <span className="flex-1 font-semibold">{x.name}</span><span className="tabular text-ink-2">{rupee(x.pricePaise)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {item.addonGroups.map(g => {
          const n = g.options.filter(o => addons.includes(o.id)).length;
          return (
            <fieldset key={g.id}>
              <legend className="mb-2 text-sm font-bold">{g.name} <span className="font-normal text-muted">· {g.min ? `choose ${g.min === g.max ? g.min : `${g.min}–${g.max || g.options.length}`}` : `optional${g.max ? `, up to ${g.max}` : ''}`}</span></legend>
              <div className="divide-y divide-line rounded-xl border border-line">
                {g.options.map(o => {
                  const on = addons.includes(o.id);
                  const full = !on && g.max > 1 && n >= g.max;
                  return (
                    <button type="button" key={o.id} onClick={() => toggle(g, o.id)} disabled={full} aria-pressed={on}
                      className="flex w-full items-center gap-3 px-3.5 py-3 text-left disabled:opacity-40">
                      <span className={`grid h-5 w-5 place-items-center rounded-md border-2 ${on ? 'border-brand bg-brand text-brand-ink' : 'border-line'}`}>{on && <Check size={13} strokeWidth={3} />}</span>
                      <VegMark veg={o.veg} size={11} /><span className="flex-1">{o.name}</span>
                      <span className="tabular text-sm text-ink-2">{o.pricePaise ? `+ ${rupee(o.pricePaise)}` : 'Free'}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>
    </Sheet>
  );
}

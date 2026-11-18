'use client';
import { Minus, Plus, Star } from 'lucide-react';
import { FoodArt } from '@/components/food-art';
import { VegMark } from '@/components/ui/kit';
import { rupee } from '@/lib/client';
import type { Item } from './types';

const TAG: Record<string, string> = { bestseller: 'Bestseller', must_try: 'Must try', new: 'New', spicy: 'Spicy' };

export function AddButton({ qty, onAdd, onInc, onDec, disabled, small }: {
  qty: number; onAdd: () => void; onInc: () => void; onDec: () => void; disabled?: boolean; small?: boolean;
}) {
  const h = small ? 'h-8 w-[84px] text-[13px]' : 'h-9 w-[96px] text-sm';
  if (disabled) return <span className={`${h} grid place-items-center rounded-lg border border-line bg-soft font-semibold text-faint`}>Sold out</span>;
  if (!qty) return (
    <button onClick={onAdd} className={`${h} relative rounded-lg border border-brand-line bg-white font-extrabold tracking-wide text-brand-text shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition hover:bg-brand-soft`}>
      ADD<Plus size={11} strokeWidth={3} className="absolute top-1 right-1.5" />
    </button>
  );
  return (
    <span className={`${h} anim-pop flex items-center justify-between rounded-lg bg-brand font-extrabold text-brand-ink shadow-[0_2px_8px_rgba(0,0,0,0.12)]`}>
      <button onClick={onDec} aria-label="Remove one" className="grid h-full w-8 place-items-center"><Minus size={15} strokeWidth={3} /></button>
      <span className="tabular">{qty}</span>
      <button onClick={onInc} aria-label="Add one" className="grid h-full w-8 place-items-center"><Plus size={15} strokeWidth={3} /></button>
    </span>
  );
}

export function TagChip({ tags }: { tags: string[] }) {
  const t = tags.find(x => TAG[x]);
  if (!t) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${t === 'spicy' ? 'bg-[#FDECEE] text-[#B42334]' : 'bg-[#FFF3E0] text-[#B45F06]'}`}>
      {t === 'bestseller' && <Star size={10} fill="currentColor" strokeWidth={0} />}{TAG[t]}
    </span>
  );
}

// Menu row: text on the left, photo on the right with the ADD button overlapping it.
export function ItemRow({ item, category, qty, onAdd, onInc, onDec, canOrder }: {
  item: Item; category: string; qty: number; onAdd: () => void; onInc: () => void; onDec: () => void; canOrder: boolean;
}) {
  return (
    <div className={`flex gap-4 py-5 ${item.available ? '' : 'opacity-60'}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2"><VegMark veg={item.veg} /><TagChip tags={item.tags} /></div>
        <h3 className="mt-1.5 text-[17px] leading-snug font-bold text-ink">{item.name}</h3>
        <p className="tabular mt-1 text-[15px] font-semibold text-ink">{item.variants?.length ? `from ${rupee(item.pricePaise)}` : rupee(item.pricePaise)}{(item.variants?.length || item.addonGroups?.length) ? <span className="ml-1.5 text-xs font-normal text-muted">customisable</span> : null}</p>
        {item.description && <p className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed text-muted">{item.description}</p>}
      </div>
      <div className="relative shrink-0 pb-4">
        <FoodArt name={item.name} category={category} imageUrl={item.imageUrl} size={128} className={item.available ? '' : 'grayscale'} />
        <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2">
          {canOrder || !item.available
            ? <AddButton qty={qty} onAdd={onAdd} onInc={onInc} onDec={onDec} disabled={!item.available} />
            : <span className="grid h-9 w-[96px] place-items-center rounded-lg border border-line bg-white text-xs font-semibold text-faint">Closed</span>}
        </div>
      </div>
    </div>
  );
}

// Small card used in "Most ordered here" and cart suggestions.
export function MiniCard({ item, category, qty, onAdd, onInc, onDec, canOrder }: {
  item: Item; category: string; qty: number; onAdd: () => void; onInc: () => void; onDec: () => void; canOrder: boolean;
}) {
  return (
    <div className="w-[148px] shrink-0">
      <div className="relative">
        <FoodArt name={item.name} category={category} imageUrl={item.imageUrl} size={148} />
        <div className="absolute right-0 -bottom-3 left-0 flex justify-center">
          {canOrder && <AddButton small qty={qty} onAdd={onAdd} onInc={onInc} onDec={onDec} disabled={!item.available} />}
        </div>
      </div>
      <div className="mt-5 flex items-center gap-1.5"><VegMark veg={item.veg} size={12} /><span className="tabular text-sm font-semibold">{item.variants?.length ? `from ${rupee(item.pricePaise)}` : rupee(item.pricePaise)}</span></div>
      <p className="mt-0.5 line-clamp-2 text-[13.5px] leading-snug font-semibold text-ink-2">{item.name}</p>
    </div>
  );
}

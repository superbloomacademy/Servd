'use client';
import { useEffect, useState } from 'react';
import { rupee } from '@/lib/client';
import { Btn, Sheet, inputCls } from '@/components/ui/kit';

export type Discount = { kind: 'percent' | 'flat'; value: number; reason: string };

/** Same maths as the server: GST after discount, optional round-off to the rupee. */
export function totals(subtotal: number, discount: number, taxBps: number, roundOff: boolean) {
  const taxable = Math.max(0, subtotal - discount);
  const tax = Math.round(taxable * taxBps / 10000);
  const raw = taxable + tax;
  const total = roundOff ? Math.round(raw / 100) * 100 : raw;
  return { tax, roundOff: total - raw, total };
}
export function discountOf(d: Discount | null, subtotal: number) {
  if (!d || !d.value) return 0;
  return d.kind === 'percent' ? Math.round(subtotal * Math.min(100, d.value) / 100) : Math.min(Math.round(d.value), subtotal);
}

const DISCOUNT_REASONS = ['Regular guest', 'Owner’s guest', 'Complaint / delay', 'Staff meal', 'Festival offer'];
const CANCEL_REASONS = ['Guest changed mind', 'Wrong item punched', 'Item not available', 'Taking too long', 'Quality complaint'];

function Chips({ list, value, onPick }: { list: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {list.map(r => <button key={r} type="button" onClick={() => onPick(r)} aria-pressed={value === r}
        className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${value === r ? 'border-ink bg-ink text-white' : 'border-line text-ink-2 hover:bg-soft'}`}>{r}</button>)}
    </div>
  );
}

// Discount on a bill: % or ₹, always with a reason (shown in the day-end report).
export function DiscountSheet({ open, onClose, subtotalPaise, current, onApply }: {
  open: boolean; onClose: () => void; subtotalPaise: number; current: Discount | null; onApply: (d: Discount | null) => Promise<unknown> | void;
}) {
  const [kind, setKind] = useState<'percent' | 'flat'>('percent');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setKind(current?.kind ?? 'percent'); setReason(current?.reason ?? '');
    setValue(current ? String(current.kind === 'flat' ? current.value / 100 : current.value) : '');
  }, [open, current]);
  const n = Number(value.replace(/[^\d.]/g, '')) || 0;
  const d: Discount = { kind, value: kind === 'flat' ? Math.round(n * 100) : n, reason: reason.trim() };
  const amount = discountOf(d, subtotalPaise);
  const ok = n > 0 && reason.trim().length > 1 && (kind === 'flat' || n <= 100);
  const go = async (x: Discount | null) => { setBusy(true); try { await onApply(x); onClose(); } finally { setBusy(false); } };

  return (
    <Sheet open={open} onClose={onClose} title="Discount"
      footer={<div className="flex gap-2">
        {current && <Btn tone="danger" size="lg" onClick={() => go(null)} disabled={busy}>Remove</Btn>}
        <Btn tone="dark" size="lg" className="flex-1" disabled={!ok} loading={busy} onClick={() => go(d)}>Give {rupee(amount)} discount</Btn>
      </div>}>
      <div className="space-y-4 p-4">
        <div className="flex gap-2">
          <div className="flex rounded-xl bg-soft p-1">
            {(['percent', 'flat'] as const).map(k => <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-lg px-4 py-2 text-sm font-bold ${kind === k ? 'bg-white shadow-sm' : 'text-muted'}`}>{k === 'percent' ? '%' : '₹'}</button>)}
          </div>
          <input autoFocus inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} placeholder={kind === 'percent' ? 'e.g. 10' : 'e.g. 50'} aria-label="Discount value" className={`${inputCls} tabular text-lg font-bold`} />
        </div>
        <p className="text-sm text-muted">Bill before discount {rupee(subtotalPaise)} · discount <b className="text-ink">{rupee(amount)}</b>. GST is charged on the amount after discount.</p>
        <div>
          <p className="text-sm font-semibold text-ink-2">Reason (required)</p>
          <Chips list={DISCOUNT_REASONS} value={reason} onPick={setReason} />
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Or type a reason" className={`${inputCls} mt-2`} maxLength={100} />
        </div>
      </div>
    </Sheet>
  );
}

// Cancel an item after the KOT: how many, and why. Reason is required and goes in the day-end report.
export function CancelItemSheet({ item, onClose, onCancel }: {
  item: { id: string; name: string; qty: number; pricePaise: number } | null; onClose: () => void; onCancel: (id: string, qty: number, reason: string) => Promise<unknown>;
}) {
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (item) { setQty(item.qty); setReason(''); } }, [item]);
  return (
    <Sheet open={!!item} onClose={onClose} title={item ? `Cancel ${item.name}?` : ''}
      footer={<Btn tone="danger" size="lg" className="w-full" disabled={reason.trim().length < 2} loading={busy}
        onClick={async () => { if (!item) return; setBusy(true); try { await onCancel(item.id, qty, reason.trim()); onClose(); } finally { setBusy(false); } }}>
        Cancel {qty} · {item ? rupee(qty * item.pricePaise) : ''}
      </Btn>}>
      {item && (
        <div className="space-y-4 p-4">
          <p className="text-sm text-ink-2">The kitchen sees the change at once. The owner sees every cancellation, with your name and reason, in the day-end report.</p>
          {item.qty > 1 && (
            <div className="flex items-center justify-between rounded-xl border border-line px-4 py-2.5">
              <span className="font-semibold">How many to cancel</span>
              <span className="flex items-center gap-3">
                <button onClick={() => setQty(q => Math.max(1, q - 1))} className="h-8 w-8 rounded-lg border border-line font-bold" aria-label="Less">−</button>
                <b className="tabular w-5 text-center">{qty}</b>
                <button onClick={() => setQty(q => Math.min(item.qty, q + 1))} className="h-8 w-8 rounded-lg border border-line font-bold" aria-label="More">+</button>
              </span>
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-ink-2">Reason (required)</p>
            <Chips list={CANCEL_REASONS} value={reason} onPick={setReason} />
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Or type a reason" className={`${inputCls} mt-2`} maxLength={100} />
          </div>
        </div>
      )}
    </Sheet>
  );
}

export function Stepper({ value, onChange, min = 0, max = 99, label }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string }) {
  return (
    <span className="inline-flex items-center rounded-lg border border-line bg-white" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="px-2.5 py-1 font-bold text-ink-2" aria-label={`Less ${label}`}>−</button>
      <span className="tabular w-6 text-center text-sm font-bold">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} className="px-2.5 py-1 font-bold text-ink-2" aria-label={`More ${label}`}>+</button>
    </span>
  );
}

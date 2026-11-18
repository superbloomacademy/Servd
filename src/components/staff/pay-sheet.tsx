'use client';
import { useEffect, useMemo, useState } from 'react';
import { Banknote, CreditCard, Globe, Plus, Smartphone, SplitSquareHorizontal, X } from 'lucide-react';
import { rupee } from '@/lib/client';
import { Btn, Sheet } from '@/components/ui/kit';
import type { Payment } from './types';

type M = Payment['method'];
const METHODS: { key: M; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: 'cash', label: 'Cash', icon: Banknote },
  { key: 'upi_shop', label: 'UPI', icon: Smartphone },
  { key: 'card', label: 'Card', icon: CreditCard },
  { key: 'online', label: 'Paid online', icon: Globe },
];
const toPaise = (s: string) => Math.round((Number(s.replace(/[^\d.]/g, '')) || 0) * 100);
const fmt = (p: number) => String(p / 100);

/**
 * Take payment for a bill. This sheet is the confirmation step: the button names the exact amount and method.
 * Cash shows the change to return. Split lets the guests pay part by cash, part by UPI, etc.
 */
export function PaySheet({ open, onClose, title, amountPaise, onPay, showOnline = false, guests = 0 }: {
  open: boolean; onClose: () => void; title: string; amountPaise: number; onPay: (p: Payment[]) => Promise<unknown>; showOnline?: boolean; guests?: number;
}) {
  const [mode, setMode] = useState<M | 'split'>('cash');
  const [given, setGiven] = useState('');
  const [rows, setRows] = useState<{ method: M; amount: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [people, setPeople] = useState(2);

  useEffect(() => {
    if (!open) return;
    setMode('cash'); setGiven(''); setBusy(false); setPeople(Math.max(2, guests || 2));
    setRows([{ method: 'cash', amount: '' }, { method: 'upi_shop', amount: '' }]);
  }, [open, guests]);

  const givenP = toPaise(given);
  const change = givenP - amountPaise;
  const splitSum = rows.reduce((a, r) => a + toPaise(r.amount), 0);
  const splitLeft = amountPaise - splitSum;
  const notes = useMemo(() => {
    const r = Math.ceil(amountPaise / 100);
    return [...new Set([r, Math.ceil(r / 100) * 100, Math.ceil(r / 500) * 500, Math.ceil(r / 2000) * 2000])].filter(x => x >= r).slice(0, 4);
  }, [amountPaise]);

  const payments: Payment[] | null = mode === 'split'
    ? (splitLeft === 0 && rows.filter(r => toPaise(r.amount) > 0).length >= 1 ? rows.filter(r => toPaise(r.amount) > 0).map(r => ({ method: r.method, amountPaise: toPaise(r.amount) })) : null)
    : mode === 'cash' && given && givenP < amountPaise ? null
      : [{ method: mode, amountPaise }];
  const label = mode === 'split' ? `Received ${rupee(amountPaise)} (split)` : `${METHODS.find(m => m.key === mode)!.label} received · ${rupee(amountPaise)}`;

  const submit = async () => {
    if (!payments) return;
    setBusy(true);
    try { await onPay(payments); } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title={title}
      footer={<Btn tone="good" size="lg" className="w-full" disabled={!payments} loading={busy} onClick={submit}>{label}</Btn>}>
      <div className="p-4">
        <div className="rounded-2xl bg-soft p-4 text-center">
          <p className="text-sm font-semibold text-muted">Amount to collect</p>
          <p className="tabular text-4xl font-extrabold">{rupee(amountPaise)}</p>
        </div>

        <div className={`mt-4 grid gap-2 ${showOnline ? 'grid-cols-5' : 'grid-cols-4'}`}>
          {METHODS.filter(m => showOnline || m.key !== 'online').map(m => (
            <button key={m.key} onClick={() => setMode(m.key)} aria-pressed={mode === m.key}
              className={`flex flex-col items-center gap-1 rounded-xl border-2 px-1 py-2.5 text-xs font-bold transition ${mode === m.key ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-2 hover:border-ink-2'}`}>
              <m.icon size={20} />{m.label}
            </button>
          ))}
          <button onClick={() => setMode('split')} aria-pressed={mode === 'split'}
            className={`flex flex-col items-center gap-1 rounded-xl border-2 px-1 py-2.5 text-xs font-bold transition ${mode === 'split' ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-2 hover:border-ink-2'}`}>
            <SplitSquareHorizontal size={20} />Split
          </button>
        </div>

        {mode === 'cash' && (
          <div className="mt-4">
            <label className="text-sm font-semibold text-ink-2" htmlFor="cash-given">Cash given by the guest (optional)</label>
            <input id="cash-given" inputMode="decimal" value={given} onChange={e => setGiven(e.target.value)} placeholder={fmt(amountPaise)}
              className="tabular mt-1.5 w-full rounded-xl border border-line px-3.5 py-3 text-xl font-bold outline-none focus:border-ink" />
            <div className="mt-2 flex flex-wrap gap-2">
              {notes.map(n => <button key={n} onClick={() => setGiven(String(n))} className="tabular rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-soft">₹{n.toLocaleString('en-IN')}</button>)}
            </div>
            {given && (givenP >= amountPaise
              ? <p className="mt-3 rounded-xl bg-[#E7F6EF] px-4 py-3 text-[#11734E]">Return change: <b className="tabular text-xl">{rupee(change)}</b></p>
              : <p className="mt-3 rounded-xl bg-[#FDECEE] px-4 py-3 text-sm text-[#B42334]">That is {rupee(-change)} short.</p>)}
          </div>
        )}
        {mode === 'upi_shop' && <p className="mt-4 rounded-xl bg-soft px-4 py-3 text-sm text-ink-2">Confirm only after you <b>hear the soundbox</b> or see the money in your bank app. Never accept a screenshot.</p>}
        {mode === 'card' && <p className="mt-4 rounded-xl bg-soft px-4 py-3 text-sm text-ink-2">Confirm after the card machine prints the slip.</p>}

        {mode === 'split' && (
          <div className="mt-4 space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <select value={r.method} onChange={e => setRows(rs => rs.map((x, k) => k === i ? { ...x, method: e.target.value as M } : x))}
                  aria-label="Payment method" className="rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-semibold">
                  {METHODS.filter(m => showOnline || m.key !== 'online').map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
                <input inputMode="decimal" value={r.amount} placeholder="₹ amount" aria-label="Amount"
                  onChange={e => setRows(rs => rs.map((x, k) => k === i ? { ...x, amount: e.target.value } : x))}
                  className="tabular min-w-0 flex-1 rounded-xl border border-line px-3 py-2.5 font-semibold outline-none focus:border-ink" />
                {splitLeft > 0 && !toPaise(r.amount) && <button onClick={() => setRows(rs => rs.map((x, k) => k === i ? { ...x, amount: fmt(splitLeft) } : x))} className="rounded-lg px-2 py-1 text-xs font-bold text-brand-text">Rest</button>}
                {rows.length > 1 && <button onClick={() => setRows(rs => rs.filter((_, k) => k !== i))} className="rounded-lg p-2 text-muted hover:bg-soft" aria-label="Remove"><X size={16} /></button>}
              </div>
            ))}
            {rows.length < 6 && <button onClick={() => setRows(rs => [...rs, { method: 'upi_shop', amount: '' }])} className="flex items-center gap-1.5 py-1 text-sm font-semibold text-brand-text"><Plus size={15} />Add another payment</button>}
            <p className={`tabular rounded-xl px-4 py-2.5 text-sm font-semibold ${splitLeft === 0 ? 'bg-[#E7F6EF] text-[#11734E]' : 'bg-[#FFF3E0] text-[#9A5500]'}`}>
              {splitLeft === 0 ? 'Payments match the bill.' : splitLeft > 0 ? `${rupee(splitLeft)} still to collect` : `${rupee(-splitLeft)} more than the bill`}
            </p>
            <div className="flex items-center justify-between rounded-xl border border-line px-4 py-2.5 text-sm">
              <span className="text-ink-2">Equal share for</span>
              <span className="flex items-center gap-2">
                <button onClick={() => setPeople(p => Math.max(2, p - 1))} className="h-7 w-7 rounded-lg border border-line font-bold" aria-label="Fewer people">−</button>
                <b className="tabular w-5 text-center">{people}</b>
                <button onClick={() => setPeople(p => Math.min(30, p + 1))} className="h-7 w-7 rounded-lg border border-line font-bold" aria-label="More people">+</button>
                <span className="text-muted">people =</span><b className="tabular">{rupee(Math.ceil(amountPaise / people / 100) * 100)}</b><span className="text-muted">each</span>
              </span>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

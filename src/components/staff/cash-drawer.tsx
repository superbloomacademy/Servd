'use client';
import { useCallback, useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Lock, Receipt, Wallet } from 'lucide-react';
import { api, clock, rupee } from '@/lib/client';
import { Btn, Empty, Sheet, Spinner, inputCls } from '@/components/ui/kit';
import { useConfirm, useToast } from '@/components/ui/providers';
import { PageHead } from './shell';
import type { VenueCtx } from './types';

type Entry = { id: string; kind: 'in' | 'out' | 'expense'; category: string; amountPaise: number; note: string; staffName: string; at: string };
type Shift = { id: string; openedBy: string; openedAt: string; openingPaise: number; closedBy: string | null; closedAt: string | null; expectedPaise: number | null; countedPaise: number | null; note: string };
type D = { shift: Shift | null; entries: Entry[]; cashSalesPaise: number; inPaise: number; outPaise: number; expensePaise: number; expectedPaise: number; history: Shift[] };

const NOTES = [500, 200, 100, 50, 20, 10, 5, 2, 1];
const EXPENSES = ['Vegetables', 'Milk', 'Gas', 'Groceries', 'Transport', 'Repairs', 'Staff advance', 'Other'];
const toPaise = (s: string) => Math.round((Number(s.replace(/[^\d.]/g, '')) || 0) * 100);

// Cash drawer: open with the cash in the drawer, record cash in / out / expenses, close by counting the notes.
export function CashDrawer({ venue }: { venue: VenueCtx }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [d, setD] = useState<D | null>(null);
  const [opening, setOpening] = useState('');
  const [entry, setEntry] = useState<Entry['kind'] | null>(null);
  const [amt, setAmt] = useState('');
  const [cat, setCat] = useState('');
  const [note, setNote] = useState('');
  const [closing, setClosing] = useState(false);
  const [count, setCount] = useState<Record<number, string>>({});
  const [closeNote, setCloseNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { try { setD(await api<D>(`/api/staff/v/${venue.id}/cash`)); } catch (e) { toast((e as Error).message, 'bad'); } }, [venue.id, toast]);
  useEffect(() => { load(); }, [load]);
  const post = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try { const r = await api(`/api/staff/v/${venue.id}/cash`, { body }); toast(ok); await load(); return r; }
    catch (e) { toast((e as Error).message, 'bad'); return null; } finally { setBusy(false); }
  };
  const counted = NOTES.reduce((a, n) => a + n * 100 * (Number(count[n]) || 0), 0);

  if (!d) return <div className="grid place-items-center py-24"><Spinner className="text-muted" /></div>;
  const s = d.shift;

  return (
    <div>
      <PageHead title="Cash drawer" sub="Start the day with the cash in the drawer. Record money put in, taken out or spent. At closing, count the notes: we tell you if anything is short or extra." />
      {!s ? (
        <section className="max-w-md rounded-2xl bg-white p-5">
          <h2 className="flex items-center gap-2 font-bold"><Wallet size={18} />Open the drawer</h2>
          <p className="mt-1 text-sm text-muted">How much cash is in the drawer right now (change for the day)?</p>
          <input value={opening} onChange={e => setOpening(e.target.value)} inputMode="decimal" placeholder="₹ e.g. 2000" className={`${inputCls} tabular mt-3 text-lg font-bold`} />
          <Btn tone="dark" size="lg" className="mt-3 w-full" loading={busy} onClick={async () => {
            if (await confirm({ title: `Open the drawer with ${rupee(toPaise(opening))}?`, body: 'Cash sales from now are added to it automatically.', confirm: 'Open drawer', tone: 'primary' }))
              post({ action: 'open', openingPaise: toPaise(opening) }, 'Drawer opened');
          }}>Open drawer</Btn>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Box label="Opening cash" v={s.openingPaise} sub={`${clock(s.openedAt)} · ${s.openedBy}`} />
            <Box label="Cash sales" v={d.cashSalesPaise} sub="from bills, incl. split" plus />
            <Box label="Cash put in" v={d.inPaise} plus />
            <Box label="Cash taken out" v={-d.outPaise} />
            <Box label="Expenses" v={-d.expensePaise} />
            <div className="rounded-2xl bg-ink p-4 text-white"><p className="text-[13px] font-semibold opacity-70">Should be in drawer</p><p className="tabular mt-1 text-2xl font-extrabold">{rupee(d.expectedPaise)}</p></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn tone="outline" onClick={() => { setEntry('in'); setAmt(''); setCat(''); setNote(''); }}><ArrowDownLeft size={16} />Cash in</Btn>
            <Btn tone="outline" onClick={() => { setEntry('out'); setAmt(''); setCat(''); setNote(''); }}><ArrowUpRight size={16} />Cash out</Btn>
            <Btn tone="outline" onClick={() => { setEntry('expense'); setAmt(''); setCat(''); setNote(''); }}><Receipt size={16} />Expense</Btn>
            <Btn tone="dark" className="ml-auto" onClick={() => { setClosing(true); setCount({}); setCloseNote(''); }}><Lock size={16} />Close drawer</Btn>
          </div>
          <section className="mt-4 rounded-2xl bg-white p-5">
            <h2 className="font-bold">Today’s entries</h2>
            {d.entries.length ? (
              <ul className="mt-2 divide-y divide-line text-sm">
                {d.entries.map(e => (
                  <li key={e.id} className="flex items-center gap-3 py-2.5">
                    <span className="tabular w-16 text-xs text-muted">{clock(e.at)}</span>
                    <span className="flex-1"><b>{e.kind === 'in' ? 'Cash in' : e.kind === 'out' ? 'Cash out' : e.category || 'Expense'}</b>{e.note && <span className="text-muted"> · {e.note}</span>}<span className="block text-xs text-muted">by {e.staffName}</span></span>
                    <span className={`tabular font-bold ${e.kind === 'in' ? 'text-good' : 'text-bad'}`}>{e.kind === 'in' ? '+' : '−'}{rupee(e.amountPaise)}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty title="No entries yet">Record petty expenses here (vegetables, gas, transport) so the cash count matches at night.</Empty>}
          </section>
        </>
      )}

      {d.history.filter(h => h.closedAt).length > 0 && (
        <section className="mt-4 rounded-2xl bg-white p-5">
          <h2 className="font-bold">Earlier closings</h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {d.history.filter(h => h.closedAt).map(h => {
              const diff = (h.countedPaise ?? 0) - (h.expectedPaise ?? 0);
              return (
                <li key={h.id} className="tabular flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span>{new Date(h.openedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {clock(h.openedAt)}–{clock(h.closedAt!)} · {h.closedBy}</span>
                  <span>expected {rupee(h.expectedPaise ?? 0)} · counted {rupee(h.countedPaise ?? 0)} · <b className={diff === 0 ? 'text-good' : 'text-bad'}>{diff === 0 ? 'matched' : diff > 0 ? `${rupee(diff)} extra` : `${rupee(-diff)} short`}</b></span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Sheet open={!!entry} onClose={() => setEntry(null)} title={entry === 'in' ? 'Cash put in' : entry === 'out' ? 'Cash taken out' : 'Expense paid from the drawer'}
        footer={<Btn tone="dark" size="lg" className="w-full" loading={busy} disabled={!toPaise(amt) || (entry !== 'in' && !(cat || note.trim()))}
          onClick={async () => { if (await post({ action: 'entry', kind: entry, amountPaise: toPaise(amt), category: cat, note }, 'Saved')) setEntry(null); }}>Save {rupee(toPaise(amt))}</Btn>}>
        <div className="space-y-3 p-4">
          <input autoFocus value={amt} onChange={e => setAmt(e.target.value)} inputMode="decimal" placeholder="₹ amount" className={`${inputCls} tabular text-lg font-bold`} />
          {entry === 'expense' && <div className="flex flex-wrap gap-2">{EXPENSES.map(x => <button key={x} onClick={() => setCat(x)} aria-pressed={cat === x} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${cat === x ? 'border-ink bg-ink text-white' : 'border-line text-ink-2'}`}>{x}</button>)}</div>}
          <input value={note} onChange={e => setNote(e.target.value)} placeholder={entry === 'in' ? 'Note (optional)' : entry === 'out' ? 'Why? e.g. Paid to owner, bank deposit' : 'Note, e.g. Ramesh vegetables'} className={inputCls} maxLength={200} />
        </div>
      </Sheet>

      <Sheet open={closing} onClose={() => setClosing(false)} title="Close the drawer"
        footer={<Btn tone="dark" size="lg" className="w-full" loading={busy} onClick={async () => {
          const diff = counted - d.expectedPaise;
          const ok = await confirm({ title: `Close with ${rupee(counted)} counted?`,
            body: diff === 0 ? 'The cash matches exactly.' : <>The drawer is <b className="text-bad">{diff > 0 ? `${rupee(diff)} extra` : `${rupee(-diff)} short`}</b>. This is recorded with your name.</>,
            confirm: 'Close drawer', tone: 'primary' });
          if (ok && await post({ action: 'close', countedPaise: counted, note: closeNote }, 'Drawer closed')) setClosing(false);
        }}>Close drawer · counted {rupee(counted)}</Btn>}>
        <div className="p-4">
          <p className="text-sm text-muted">Count the notes and coins. The drawer should have <b className="text-ink">{rupee(d.expectedPaise)}</b>.</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {NOTES.map(n => (
              <label key={n} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                <span className="tabular w-10 text-sm font-bold">₹{n}</span><span className="text-muted">×</span>
                <input value={count[n] || ''} onChange={e => setCount(c => ({ ...c, [n]: e.target.value.replace(/\D/g, '') }))} inputMode="numeric" placeholder="0" aria-label={`Number of ₹${n}`} className="tabular w-full min-w-0 text-right font-semibold outline-none" />
              </label>
            ))}
          </div>
          <div className={`tabular mt-3 flex justify-between rounded-xl px-4 py-3 font-bold ${counted === d.expectedPaise ? 'bg-[#E7F6EF] text-[#11734E]' : 'bg-[#FFF3E0] text-[#9A5500]'}`}>
            <span>Counted {rupee(counted)}</span><span>{counted === d.expectedPaise ? 'Matches' : counted > d.expectedPaise ? `${rupee(counted - d.expectedPaise)} extra` : `${rupee(d.expectedPaise - counted)} short`}</span>
          </div>
          <input value={closeNote} onChange={e => setCloseNote(e.target.value)} placeholder="Note (optional), e.g. ₹200 short, checking with Ravi" className={`${inputCls} mt-3`} maxLength={200} />
        </div>
      </Sheet>
    </div>
  );
}

function Box({ label, v, sub, plus }: { label: string; v: number; sub?: string; plus?: boolean }) {
  return <div className="rounded-2xl bg-white p-4"><p className="text-[13px] font-semibold text-muted">{label}</p><p className="tabular mt-1 text-2xl font-extrabold">{v < 0 ? `−${rupee(-v)}` : `${plus && v ? '+' : ''}${rupee(v)}`}</p>{sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}</div>;
}

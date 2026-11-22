'use client';
// Buying: new purchase (order, or a bill already here), receiving a delivery, suppliers and what you owe them.
import { useEffect, useState } from 'react';
import { MessageCircle, Phone, Plus, Truck, X } from 'lucide-react';
import { api, timeAgo } from '@/lib/client';
import { Btn, Empty, Field, Pill, Sheet, Spinner, inputCls } from '@/components/ui/kit';
import { useConfirm } from '@/components/ui/providers';
import { money, num, paise, qtyText, Rs, type Inv, type Mat, type Post, type Purchase, type Supplier } from './inv-parts';

export type Draft = { supplierId: string; lines: { id: string; qty: number; buy: boolean }[] };
type L = { id: string; qty: string; buy: boolean; rate: string; tax: string; expiry: string };
const unitOf = (m: Mat, buy: boolean) => (buy && m.buyUnit ? m.buyUnit : m.unit);

export function PurchaseEditor({ draft, inv, post, onClose, onDone }: { draft: Draft | null; inv: Inv; post: Post; onClose: () => void; onDone: () => void }) {
  const confirm = useConfirm();
  const [sup, setSup] = useState(''); const [lines, setLines] = useState<L[]>([]); const [here, setHere] = useState(true);
  const [billNo, setBillNo] = useState(''); const [billDate, setBillDate] = useState(''); const [expected, setExpected] = useState(''); const [busy, setBusy] = useState(false); const [newSup, setNewSup] = useState<string | null>(null);
  const rateFor = (m: Mat, buy: boolean) => (m.costPaise ? String(Math.round(m.costPaise * (buy && m.buyUnit ? m.buyFactor : 1)) / 100) : '');
  useEffect(() => {
    if (!draft) return;
    setSup(draft.supplierId); setHere(!draft.lines.length); setBillNo(''); setExpected(''); setNewSup(null);
    setBillDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()));
    setLines(draft.lines.map(l => { const m = inv.items.find(i => i.id === l.id)!; return { id: l.id, qty: l.qty ? String(l.qty) : '', buy: l.buy, rate: rateFor(m, l.buy), tax: '0', expiry: '' }; }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  const set = (i: number, p: Partial<L>) => setLines(ls => ls.map((l, k) => (k === i ? { ...l, ...p } : l)));
  const total = lines.reduce((a, l) => a + num(l.qty) * paise(l.rate) * (1 + num(l.tax) / 100), 0);
  const raw = inv.items.filter(m => m.active && m.kind === 'raw');
  const ok = lines.length > 0 && lines.every(l => num(l.qty) > 0 && (!here || num(l.rate) > 0));
  const send = async (allowDuplicate = false): Promise<void> => {
    setBusy(true);
    const r = await post({ action: 'purchase', supplierId: sup || null, expectedOn: !here && expected ? expected : null, lines: lines.map(l => ({ stockItemId: l.id, inBuyUnit: l.buy, qty: num(l.qty), ratePaise: paise(l.rate), taxBps: Math.round(num(l.tax) * 100), expiry: here && l.expiry ? l.expiry : null })), ...(here ? { received: { billNo, billDate, allowDuplicate } } : {}) }, here ? 'Bill entered and stock added' : 'Order saved');
    setBusy(false);
    if (r === 'DUPLICATE_BILL') { if (await confirm({ title: 'Enter this bill again?', body: 'A bill with this number from this supplier is already entered. Entering it twice adds the stock and the amount owed twice.', confirm: 'It is a different bill', tone: 'danger' })) return send(true); return; }
    if (r) onDone();
  };
  return (
    <Sheet open={!!draft} onClose={onClose} title="Buy stock" wide full footer={<div className="flex items-center gap-4"><span className="tabular"><span className="block text-xs text-muted">Total with GST</span><b className="text-xl">{money(total)}</b></span><Btn tone="dark" size="lg" className="flex-1" disabled={!ok} loading={busy} onClick={() => send()}>{here ? 'Enter bill & add stock' : 'Save order'}</Btn></div>}>
      <div className="space-y-4 p-4">
        <div className="flex rounded-xl bg-soft p-1 text-sm font-semibold">{([[true, 'The goods are here (enter bill)'], [false, 'Order for later']] as const).map(([k, l]) => <button key={l} type="button" onClick={() => setHere(k)} className={`flex-1 rounded-lg py-2 ${here === k ? 'bg-white shadow-sm' : 'text-muted'}`}>{l}</button>)}</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Supplier">{newSup === null ? <select value={sup} onChange={e => (e.target.value === '+' ? setNewSup('') : setSup(e.target.value))} className={inputCls}><option value="">No supplier (cash market)</option>{inv.suppliers.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}<option value="+">+ New supplier…</option></select>
            : <span className="flex gap-1"><input autoFocus value={newSup} onChange={e => setNewSup(e.target.value)} placeholder="Supplier name" className={inputCls} /><Btn size="sm" tone="dark" disabled={newSup.trim().length < 2} onClick={async () => { const r = await post({ action: 'supplier', name: newSup }, 'Supplier added'); if (r?.supplier) { setSup(r.supplier.id); setNewSup(null); } }}>Add</Btn></span>}</Field>
          {here ? <><Field label="Bill number"><input value={billNo} onChange={e => setBillNo(e.target.value)} className={inputCls} /></Field><Field label="Bill date"><input type="date" value={billDate} onChange={e => setBillDate(e.target.value)} className={inputCls} /></Field></> : <Field label="Expected on"><input type="date" value={expected} onChange={e => setExpected(e.target.value)} className={inputCls} /></Field>}
        </div>
        <ul className="space-y-2">
          {lines.map((l, i) => { const m = inv.items.find(x => x.id === l.id)!; const u = unitOf(m, l.buy); return (
            <li key={l.id} className="rounded-xl border border-line p-3">
              <div className="flex items-center justify-between gap-2"><b>{m.name}</b><span className="flex items-center gap-2"><span className="tabular text-sm font-bold">{money(num(l.qty) * paise(l.rate) * (1 + num(l.tax) / 100))}</span><button onClick={() => setLines(ls => ls.filter((_, k) => k !== i))} aria-label={`Remove ${m.name}`} className="rounded-lg p-1.5 text-muted hover:bg-soft"><X size={16} /></button></span></div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Field label="Quantity"><span className="flex rounded-xl border border-line focus-within:border-ink"><input value={l.qty} autoFocus={!l.qty && i === lines.length - 1} onChange={e => set(i, { qty: e.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" aria-label={`Quantity of ${m.name}`} className="tabular w-full min-w-0 bg-transparent px-3 py-2.5 text-right font-semibold outline-none" />{m.buyUnit ? <select value={l.buy ? 'b' : 's'} aria-label="Unit" onChange={e => set(i, { buy: e.target.value === 'b', rate: rateFor(m, e.target.value === 'b') })} className="bg-transparent pr-2 text-sm text-muted outline-none"><option value="b">{m.buyUnit}</option><option value="s">{m.unit}</option></select> : <span className="self-center pr-3 text-sm text-muted">{m.unit}</span>}</span></Field>
                <Field label={`Rate per ${u}`}><Rs value={l.rate} onChange={v => set(i, { rate: v })} label={`Rate of ${m.name}`} /></Field>
                <Field label="GST"><select value={l.tax} onChange={e => set(i, { tax: e.target.value })} className={inputCls}>{['0', '5', '12', '18', '28'].map(t => <option key={t} value={t}>{t}%</option>)}</select></Field>
                {here && <Field label={`Expiry${m.shelfDays ? ` (or ${m.shelfDays} days)` : ''}`}><input type="date" value={l.expiry} onChange={e => set(i, { expiry: e.target.value })} className={inputCls} /></Field>}
              </div>
              {l.buy && m.buyUnit && num(l.qty) > 0 && <p className="mt-1.5 text-xs text-muted">= {qtyText(num(l.qty) * m.buyFactor, m.unit)}{paise(l.rate) ? ` at ${money(paise(l.rate) * (1 + num(l.tax) / 100) / m.buyFactor)} per ${m.unit} with GST` : ''}</p>}
              {paise(l.rate) > 0 && m.costPaise > 0 && Math.abs(paise(l.rate) * (1 + num(l.tax) / 100) / (l.buy && m.buyUnit ? m.buyFactor : 1) / m.costPaise - 1) > 0.15 && <p className="mt-1 text-xs font-semibold text-[#9A5500]">Last time: {money(m.costPaise)} per {m.unit}. Check this rate.</p>}
            </li>); })}
        </ul>
        <select value="" aria-label="Add material" onChange={e => { const m = raw.find(x => x.id === e.target.value); if (m) setLines(ls => [...ls, { id: m.id, qty: '', buy: !!m.buyUnit, rate: rateFor(m, !!m.buyUnit), tax: '0', expiry: '' }]); }} className={`${inputCls} font-semibold`}><option value="">+ Add a material…</option>{raw.filter(m => !lines.some(l => l.id === m.id)).map(m => <option key={m.id} value={m.id}>{m.name} ({qtyText(m.qty, m.unit)} in stock)</option>)}</select>
      </div>
    </Sheet>
  );
}

const STATUS = { ordered: ['info', 'Ordered'], part: ['warn', 'Part arrived'], received: ['good', 'Received'], cancelled: ['neutral', 'Cancelled'] } as const;
export function Purchases({ inv, post, onNew }: { inv: Inv; post: Post; onNew: () => void }) {
  const confirm = useConfirm();
  const [rec, setRec] = useState<Purchase | null>(null);
  const name = (id: string | null) => inv.suppliers.find(s => s.id === id)?.name ?? 'No supplier';
  const wa = (p: Purchase) => { const s = inv.suppliers.find(x => x.id === p.supplierId); const text = `Order ${p.number}\n` + p.lines.map(l => `- ${l.name}: ${l.qty} ${l.unit}`).join('\n') + (p.expectedOn ? `\nNeeded on ${p.expectedOn}` : ''); return `https://wa.me/${s?.phone ? '91' + s.phone.replace(/\D/g, '').slice(-10) : ''}?text=${encodeURIComponent(text)}`; };
  if (!inv.purchases.length) return <div className="rounded-2xl bg-white"><Empty icon={<Truck />} title="No purchases yet">Enter a supplier bill, or place an order and receive it when it arrives.</Empty><div className="flex justify-center pb-8"><Btn tone="dark" onClick={onNew}><Plus size={16} />Buy stock</Btn></div></div>;
  return (
    <>
      <ul className="space-y-3">{inv.purchases.map(p => (
        <li key={p.id} className="rounded-2xl bg-white p-4">
          <div className="flex flex-wrap items-center gap-2"><b>Purchase {p.number}</b><Pill tone={STATUS[p.status][0]}>{STATUS[p.status][1]}</Pill><span className="text-sm text-muted">{name(p.supplierId)} · {timeAgo(p.createdAt)} · {p.createdBy}</span><b className="tabular ml-auto">{money(p.totalPaise)}</b></div>
          <p className="mt-1 text-sm text-ink-2">{p.lines.map(l => `${l.name} ${l.received !== l.qty && p.status !== 'ordered' ? `${l.received} of ` : ''}${l.qty} ${l.unit}`).join(' · ')}</p>
          {p.receipts.length > 0 && <p className="mt-1 text-xs text-muted">{p.receipts.map(r => `Bill ${r.billNo || '—'} · ${r.billDate} · ${money(r.totalPaise)}`).join('   ')}</p>}
          {(p.status === 'ordered' || p.status === 'part') && <div className="mt-3 flex flex-wrap gap-2"><Btn size="sm" tone="good" onClick={() => setRec(p)}><Truck size={14} />Receive delivery</Btn><a href={wa(p)} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold hover:bg-soft"><MessageCircle size={14} />Send on WhatsApp</a>
            <Btn size="sm" tone="ghost" onClick={async () => { if (await confirm(p.status === 'part' ? { title: `Close purchase ${p.number}?`, body: 'The rest is not coming. What already arrived stays in stock.', confirm: 'Close it', tone: 'primary' } : { title: `Cancel purchase ${p.number}?`, body: 'Nothing has arrived, so stock does not change.', confirm: 'Cancel order', tone: 'danger' })) post({ action: 'close_purchase', id: p.id }, 'Done'); }}>{p.status === 'part' ? 'Rest isn’t coming' : 'Cancel'}</Btn></div>}
        </li>))}</ul>
      <Receive p={rec} post={post} supplier={name(rec?.supplierId ?? null)} onClose={() => setRec(null)} />
    </>
  );
}
function Receive({ p, post, supplier, onClose }: { p: Purchase | null; post: Post; supplier: string; onClose: () => void }) {
  const confirm = useConfirm();
  const [ls, setLs] = useState<{ id: string; qty: string; rate: string; tax: string; expiry: string }[]>([]);
  const [bill, setBill] = useState({ no: '', date: '' }); const [busy, setBusy] = useState(false);
  useEffect(() => { if (p) { setLs(p.lines.map(l => ({ id: l.id, qty: String(Math.max(0, Math.round((l.qty - l.received) * 1000) / 1000)), rate: l.ratePaise ? String(l.ratePaise / 100) : '', tax: String(l.taxBps / 100), expiry: '' }))); setBill({ no: '', date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()) }); } }, [p]);
  if (!p) return null;
  const total = ls.reduce((a, l) => a + num(l.qty) * paise(l.rate) * (1 + num(l.tax) / 100), 0);
  const set = (i: number, x: object) => setLs(v => v.map((l, k) => (k === i ? { ...l, ...x } : l)));
  const go = async (allowDuplicate = false): Promise<void> => {
    setBusy(true);
    const r = await post({ action: 'receive', purchaseId: p.id, billNo: bill.no, billDate: bill.date, allowDuplicate, lines: ls.map(l => ({ lineId: l.id, qty: num(l.qty), ratePaise: paise(l.rate), taxBps: Math.round(num(l.tax) * 100), expiry: l.expiry || null })) }, 'Delivery received, stock added');
    setBusy(false);
    if (r === 'DUPLICATE_BILL') { if (await confirm({ title: 'Enter this bill again?', body: 'This supplier’s bill number is already entered.', confirm: 'It is a different bill', tone: 'danger' })) return go(true); return; }
    if (r) onClose();
  };
  return (
    <Sheet open onClose={onClose} title={`Receive purchase ${p.number} · ${supplier}`} wide footer={<Btn tone="good" size="lg" className="w-full" loading={busy} disabled={!ls.some(l => num(l.qty) > 0) || ls.some(l => num(l.qty) > 0 && !num(l.rate))} onClick={() => go()}>Receive · bill {money(total)}</Btn>}>
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3"><Field label="Bill number"><input autoFocus value={bill.no} onChange={e => setBill({ ...bill, no: e.target.value })} className={inputCls} /></Field><Field label="Bill date"><input type="date" value={bill.date} onChange={e => setBill({ ...bill, date: e.target.value })} className={inputCls} /></Field></div>
        <p className="text-sm text-muted">Weigh and count what really arrived. Put 0 for anything missing; it stays on the order.</p>
        {p.lines.map((l, i) => ls[i] && <div key={l.id} className="rounded-xl border border-line p-3"><p className="flex justify-between"><b>{l.name}</b><span className="text-sm text-muted">ordered {l.qty} {l.unit}{l.received ? `, ${l.received} came before` : ''}</span></p><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4"><Field label={`Arrived (${l.unit})`}><input value={ls[i].qty} onChange={e => set(i, { qty: e.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" className={inputCls} /></Field><Field label="Rate"><Rs value={ls[i].rate} onChange={v => set(i, { rate: v })} label={`Rate of ${l.name}`} /></Field><Field label="GST"><select value={ls[i].tax} onChange={e => set(i, { tax: e.target.value })} className={inputCls}>{['0', '5', '12', '18', '28'].map(t => <option key={t} value={t}>{t}%</option>)}</select></Field><Field label="Expiry"><input type="date" value={ls[i].expiry} onChange={e => set(i, { expiry: e.target.value })} className={inputCls} /></Field></div></div>)}
      </div>
    </Sheet>
  );
}

type Ledger = { bills: { id: string; billNo: string; billDate: string; totalPaise: number; at: string }[]; payments: { id: string; amountPaise: number; method: string; note: string; by: string; at: string }[] };
export function Suppliers({ venueId, inv, post }: { venueId: string; inv: Inv; post: Post }) {
  const confirm = useConfirm();
  const [edit, setEdit] = useState<Partial<Supplier> | null>(null); const [open, setOpen] = useState<Supplier | null>(null); const [led, setLed] = useState<Ledger | null>(null);
  const [pay, setPay] = useState({ amount: '', method: 'upi', drawer: false, note: '' }); const [f, setF] = useState({ name: '', phone: '', gstin: '', notes: '' });
  useEffect(() => { if (edit) setF({ name: edit.name ?? '', phone: edit.phone ?? '', gstin: edit.gstin ?? '', notes: edit.notes ?? '' }); }, [edit]);
  const cur = open ? inv.suppliers.find(s => s.id === open.id) ?? open : null;
  useEffect(() => { setLed(null); if (cur) api<Ledger>(`/api/staff/v/${venueId}/inventory?view=supplier&id=${cur.id}`).then(setLed).catch(() => {}); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id, cur?.duePaise, venueId]);
  return (
    <>
      <div className="mb-3 flex justify-end"><Btn tone="outline" onClick={() => setEdit({})}><Plus size={16} />Supplier</Btn></div>
      {inv.suppliers.length ? <ul className="divide-y divide-line rounded-2xl bg-white">{inv.suppliers.map(s => <li key={s.id}><button onClick={() => { setOpen(s); setPay({ amount: '', method: 'upi', drawer: false, note: '' }); }} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-soft"><span className="min-w-0 flex-1"><b>{s.name}</b><span className="block text-xs text-muted">{[s.phone, s.lastBill && `last bill ${s.lastBill}`].filter(Boolean).join(' · ') || 'No bills yet'}</span></span><span className="text-right"><b className={`tabular ${s.duePaise > 0 ? 'text-bad' : ''}`}>{money(s.duePaise)}</b><span className="block text-xs text-muted">{s.duePaise > 0 ? 'to pay' : 'settled'}</span></span></button></li>)}</ul> : <div className="rounded-2xl bg-white"><Empty icon={<Truck />} title="No suppliers yet">Add the people you buy from to track what you owe each of them.</Empty></div>}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Edit ${edit.name}` : 'New supplier'} footer={<Btn tone="dark" size="lg" className="w-full" disabled={f.name.trim().length < 2} onClick={async () => { if (await post({ action: 'supplier', id: edit?.id, ...f }, 'Saved')) setEdit(null); }}>Save</Btn>}><div className="grid gap-3 p-4"><Field label="Name"><input autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={inputCls} /></Field><Field label="Mobile (for WhatsApp orders)"><input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} inputMode="numeric" className={inputCls} /></Field><Field label="GSTIN"><input value={f.gstin} onChange={e => setF({ ...f, gstin: e.target.value.toUpperCase() })} maxLength={15} className={inputCls} /></Field><Field label="Notes"><input value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} className={inputCls} /></Field></div></Sheet>
      <Sheet open={!!cur && !edit} onClose={() => setOpen(null)} title={cur?.name ?? ''} wide>
        {cur && <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-3"><div><p className="text-xs text-muted">You owe</p><p className="tabular text-3xl font-extrabold">{money(cur.duePaise)}</p></div><span className="ml-auto flex gap-2">{cur.phone && <a href={`tel:${cur.phone}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold"><Phone size={14} />Call</a>}<Btn size="sm" tone="outline" onClick={() => setEdit(cur)}>Edit</Btn></span></div>
          {cur.duePaise > 0 && <div className="rounded-xl bg-soft p-3"><p className="text-sm font-bold">Record a payment</p><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4"><Rs value={pay.amount} onChange={v => setPay({ ...pay, amount: v })} label="Amount paid" /><select value={pay.method} onChange={e => setPay({ ...pay, method: e.target.value, drawer: false })} aria-label="How" className={inputCls}><option value="upi">UPI</option><option value="bank">Bank</option><option value="cash">Cash</option><option value="card">Card</option></select><input value={pay.note} onChange={e => setPay({ ...pay, note: e.target.value })} placeholder="Reference" className={inputCls} /><Btn tone="dark" disabled={!paise(pay.amount) || paise(pay.amount) > cur.duePaise} onClick={async () => { if (!(await confirm({ title: `Paid ${money(paise(pay.amount))} to ${cur.name}?`, body: `By ${pay.method === 'upi' ? 'UPI' : pay.method}${pay.drawer ? ', taken from the cash drawer' : ''}. After this you owe ${money(cur.duePaise - paise(pay.amount))}.`, confirm: 'Record payment', tone: 'primary' }))) return; if (await post({ action: 'pay', supplierId: cur.id, amountPaise: paise(pay.amount), method: pay.method, fromDrawer: pay.drawer, note: pay.note }, 'Payment recorded')) setPay({ amount: '', method: 'upi', drawer: false, note: '' }); }}>Paid</Btn></div>{pay.method === 'cash' && <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={pay.drawer} onChange={e => setPay({ ...pay, drawer: e.target.checked })} />Taken from the cash drawer</label>}{paise(pay.amount) > cur.duePaise && <p className="mt-1 text-xs text-bad">That is more than you owe.</p>}</div>}
          {!led ? <Spinner className="text-muted" /> : <ul className="divide-y divide-line text-sm">{[...led.bills.map(b => ({ at: b.at, t: `Bill ${b.billNo || '—'}`, s: b.billDate, a: b.totalPaise })), ...led.payments.map(x => ({ at: x.at, t: `Paid by ${x.method}`, s: [x.note, x.by].filter(Boolean).join(' · '), a: -x.amountPaise }))].sort((x, y) => +new Date(y.at) - +new Date(x.at)).map((e, i) => <li key={i} className="flex justify-between py-2"><span><b>{e.t}</b><span className="block text-xs text-muted">{e.s}</span></span><b className={`tabular ${e.a < 0 ? 'text-good' : ''}`}>{e.a < 0 ? '−' : '+'}{money(Math.abs(e.a))}</b></li>)}</ul>}
        </div>}
      </Sheet>
    </>
  );
}

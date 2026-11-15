'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ChevronRight, HelpCircle, LogOut, Receipt, UserRound, QrCode } from 'lucide-react';
import { api, rupee, store, timeAgo } from '@/lib/client';
import { Btn, Empty, Field, Pill, Spinner, inputCls } from '@/components/ui/kit';
import { useConfirm, useToast } from '@/components/ui/providers';
import { LoginSheet } from './login-sheet';
import { ACTIVE, type OrderView } from './types';

type Me = { name: string; phone: string; email: string; since: string };
type Ticket = { id: string; topic: string; message: string; status: 'open' | 'resolved'; reply: string | null; createdAt: string; orderId: string | null };
const TOPICS = ['Missing or wrong item', 'Order is late', 'Payment / refund', 'Food quality', 'Something else'];
const FAQ: [string, string][] = [
  ['I paid, but it still says “Payment pending”', 'The venue checks every payment in their bank app or soundbox before confirming, which can take a minute. If it takes longer, show your KOT number and UPI reference at the counter.'],
  ['Where is my GST bill?', 'Open the order. Once the staff confirm your payment, a “View GST bill” button appears. Restaurant tables get one bill for the whole table when it’s closed.'],
  ['Can I cancel my order?', 'Yes, from the order page, until you pay. After that, please talk to the staff.'],
  ['My order was rejected after I paid', 'The venue refunds you directly: ask at the counter. If you don’t get it, report it below and we’ll follow up.'],
  ['Why can’t I order from home?', 'Ordering opens when you scan the QR code at your seat, table or counter, and works while the venue is open (or during your show).'],
  ['I didn’t get my login code', 'Codes come by email. Check your Spam or Promotions folder, wait 30 seconds and tap “Resend code”.'],
];

// Customer account: orders at every venue, help & support, profile. Ordering still needs a QR scan.
export function Account() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [tab, setTab] = useState<'orders' | 'help' | 'profile'>((params.get('tab') as 'help') || 'orders');
  const [orders, setOrders] = useState<OrderView[] | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [form, setForm] = useState({ topic: TOPICS[0], orderId: params.get('order') || '', message: '' });
  const [profile, setProfile] = useState({ name: '', email: '' });
  const [busy, setBusy] = useState(false);
  const lastCode = store.get<string | null>('sv_last_code', null);

  const load = useCallback(async () => {
    const r = await api<{ customer: Me | null }>('/api/me');
    setMe(r.customer);
    if (r.customer) {
      setProfile({ name: r.customer.name, email: r.customer.email });
      const [o, t] = await Promise.all([api<{ orders: OrderView[] }>('/api/me/orders'), api<{ tickets: Ticket[] }>('/api/support')]);
      setOrders(o.orders); setTickets(t.tickets);
    }
  }, []);
  useEffect(() => { load().catch(() => setMe(null)); }, [load]);

  if (me === undefined) return <div className="grid min-h-dvh place-items-center"><Spinner size={28} className="text-muted" /></div>;

  const header = (
    <div className="flex items-center gap-2 px-4 py-3.5">
      <button onClick={() => (lastCode ? router.push(`/q/${lastCode}`) : router.push('/'))} aria-label="Back" className="-ml-1 rounded-full p-1.5 hover:bg-soft"><ArrowLeft size={22} /></button>
      <h1 className="text-lg font-extrabold">My account</h1>
    </div>
  );
  if (!me) return (
    <div className="mx-auto max-w-[560px]">{header}
      <Empty icon={<UserRound />} title="Log in to see your orders">Orders, rewards and help requests are saved to your phone number, at every venue that uses servd.</Empty>
      <LoginSheet open onClose={() => (lastCode ? router.push(`/q/${lastCode}`) : router.push('/'))} onDone={() => load()} />
    </div>
  );

  const active = orders?.filter(o => ACTIVE.includes(o.status)) || [];
  const past = orders?.filter(o => !ACTIVE.includes(o.status)) || [];
  const submit = async () => {
    setBusy(true);
    try { await api('/api/support', { body: form }); toast('Sent. The venue will reply here.'); setForm({ ...form, message: '' }); load(); }
    catch (e) { toast((e as Error).message, 'bad'); } finally { setBusy(false); }
  };
  const saveProfile = async () => {
    setBusy(true);
    try { await api('/api/me', { method: 'PATCH', body: profile }); toast('Profile saved'); load(); }
    catch (e) { toast((e as Error).message, 'bad'); } finally { setBusy(false); }
  };
  const logout = async () => {
    if (!(await confirm({ title: 'Log out on this phone?', body: 'Your orders stay saved. Log in again with your number anytime.', confirm: 'Log out' }))) return;
    await api('/api/auth/logout', { body: {} }); setMe(null);
  };

  return (
    <div className="mx-auto min-h-dvh max-w-[560px] bg-white pb-12">
      {header}
      <div className="px-4">
        <div className="flex items-center gap-3 rounded-2xl bg-soft p-4">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-ink text-lg font-bold text-white">{(me.name || 'U').slice(0, 1).toUpperCase()}</div>
          <div><p className="font-bold">{me.name || 'Add your name'}</p><p className="tabular text-sm text-muted">+91 {me.phone}{me.email ? ` · ${me.email}` : ''}</p></div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-soft p-1 text-sm font-semibold" role="tablist">
          {([['orders', 'Orders', Receipt], ['help', 'Help', HelpCircle], ['profile', 'Profile', UserRound]] as const).map(([k, l, I]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`flex items-center justify-center gap-1.5 rounded-lg py-2 ${tab === k ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}><I size={15} />{l}</button>
          ))}
        </div>
      </div>

      {tab === 'orders' && (
        <div className="px-4 pt-4">
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-dashed border-line p-3 text-sm text-ink-2"><QrCode size={20} className="shrink-0 text-muted" />To order, scan the QR code at your seat or table.</div>
          {!orders ? <Spinner className="text-muted" /> : !orders.length ? <Empty icon={<Receipt />} title="No orders yet">Your orders from every venue will appear here.</Empty> : (
            <>
              {active.length > 0 && <h2 className="mb-2 text-sm font-bold tracking-wide text-muted uppercase">In progress</h2>}
              {active.map(o => <OrderCard key={o.id} o={o} />)}
              {past.length > 0 && <h2 className="mt-5 mb-2 text-sm font-bold tracking-wide text-muted uppercase">Past orders</h2>}
              {past.map(o => <OrderCard key={o.id} o={o} />)}
            </>
          )}
        </div>
      )}

      {tab === 'help' && (
        <div className="space-y-4 px-4 pt-4">
          <div className="rounded-2xl border border-line">
            <h2 className="px-4 pt-4 font-bold">Quick answers</h2>
            <div className="divide-y divide-line">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group px-4 py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold">{q}<span className="text-muted transition group-open:rotate-45">+</span></summary>
                  <p className="mt-2 text-sm text-ink-2">{a}</p>
                </details>
              ))}
            </div>
          </div>
          <div className="space-y-3 rounded-2xl border border-line p-4">
            <h2 className="font-bold">Report a problem</h2>
            <Field label="What went wrong?"><select className={inputCls} value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })}>{TOPICS.map(t => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Which order?">
              <select className={inputCls} value={form.orderId} onChange={e => setForm({ ...form, orderId: e.target.value })}>
                <option value="">Not about a specific order</option>
                {(orders || []).slice(0, 15).map(o => <option key={o.id} value={o.id}>KOT {o.kotNo} · {o.venue?.venueName} · {timeAgo(o.createdAt)}</option>)}
              </select>
            </Field>
            <Field label="Tell us more"><textarea rows={3} className={inputCls} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} maxLength={1000} placeholder="e.g. Cola was missing from my order" /></Field>
            <Btn tone="dark" className="w-full" loading={busy} disabled={form.message.trim().length < 5} onClick={submit}>Send to the venue</Btn>
          </div>
          {tickets.map(t => (
            <div key={t.id} className="rounded-2xl border border-line p-4 text-sm">
              <div className="flex items-center justify-between gap-2"><b>{t.topic}</b><Pill tone={t.status === 'resolved' ? 'good' : 'warn'}>{t.status === 'resolved' ? 'Replied' : 'Waiting for reply'}</Pill></div>
              <p className="mt-1 text-ink-2">{t.message}</p>
              {t.reply && <p className="mt-2 rounded-xl bg-soft p-3"><b className="block text-xs text-muted">Venue replied</b>{t.reply}</p>}
              <p className="mt-2 text-xs text-muted">{timeAgo(t.createdAt)}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'profile' && (
        <div className="space-y-4 px-4 pt-4">
          <Field label="Name"><input className={inputCls} value={profile.name} maxLength={40} onChange={e => setProfile({ ...profile, name: e.target.value })} /></Field>
          <Field label="Email" hint="Your login codes come here. It can't be changed yet."><input className={inputCls} value={me.email || 'Not added yet'} disabled /></Field>
          <Field label="Phone" hint="Your login number. It can't be changed."><input className={inputCls} value={`+91 ${me.phone}`} disabled /></Field>
          <Btn tone="dark" className="w-full" loading={busy} onClick={saveProfile}>Save profile</Btn>
          <button onClick={logout} className="flex w-full items-center justify-center gap-2 rounded-xl border border-line py-3 text-sm font-semibold text-bad"><LogOut size={16} />Log out</button>
        </div>
      )}
    </div>
  );
}

function OrderCard({ o }: { o: OrderView }) {
  const tone = o.status === 'delivered' ? 'good' : ['cancelled', 'rejected'].includes(o.status) ? 'bad' : 'warn';
  const label = { awaiting_payment: 'Payment pending', confirmed: 'Confirmed', preparing: 'Preparing', ready: 'Ready', out: 'On the way', delivered: o.fulfilment === 'pickup' ? 'Collected' : 'Served', cancelled: 'Cancelled', rejected: 'Rejected' }[o.status];
  return (
    <Link href={`/o/${o.id}`} className="mb-3 flex items-center gap-3 rounded-2xl border border-line p-4 hover:bg-soft">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-extrabold text-white" style={{ background: o.venue?.brandColor || '#1C1C1C' }}>{(o.venue?.vendorName || '?').slice(0, 1)}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2"><p className="truncate font-bold">{o.venue?.vendorName}</p><Pill tone={tone}>{label}</Pill></div>
        <p className="truncate text-[13px] text-muted">{o.items.map(i => `${i.qty}× ${i.name}`).join(', ')}</p>
        <p className="tabular mt-0.5 text-xs text-muted">KOT {o.kotNo} · {rupee(o.totalPaise)} · {timeAgo(o.createdAt)}</p>
      </div>
      <ChevronRight size={18} className="text-faint" />
    </Link>
  );
}

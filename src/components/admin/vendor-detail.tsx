'use client';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, Circle, Copy, ExternalLink, KeyRound, MessageCircle, Plus, Power, Rocket, Undo2 } from 'lucide-react';
import { api, rupee, timeAgo } from '@/lib/client';
import { Btn, Field, Pill, Sheet, Spinner, Toggle, inputCls } from '@/components/ui/kit';
import { useConfirm, useToast } from '@/components/ui/providers';
import { ROLE_LABEL } from '@/lib/roles';
import { Card, DEFAULT_MODE, DemoBadge, Kpi, Logo, MODES_FOR, MODE_LABEL, PageHead, Progress, TYPE_LABEL, VendorStatus, day, makePin, pct } from './common';
import type { Nav } from './super-admin';

type Step = { key: string; label: string; hint: string; done: boolean; required: boolean };
type Checklist = { steps: Step[]; done: number; total: number; ready: boolean };
type Vendor = {
  id: string; name: string; brandColor: string; logoUrl: string | null; legalName: string | null; gstin: string | null; fssai: string | null;
  address: string | null; phone: string | null; email: string | null; contactName: string | null; invoicePrefix: string | null; invoicePrefixShown: string;
  commissionBps: number; monthlyFeePaise: number; trialEndsAt: string | null; status: 'active' | 'suspended'; stage: 'setup' | 'live';
  liveAt: string | null; notes: string; createdAt: string; features: Features; isDemo: boolean;
};
type Features = { pos: boolean; inventory: boolean; customers: boolean };
type Src = { orders: number; sales: number };
type Usage = { qr: Src; counter: Src; apps: Src; lastOrderAt: string | null; materials: number; drawerDays: number };
type Venue = { id: string; name: string; type: string; serviceMode: string; city: string | null; isOpen: boolean; upiId: string | null; taxBps: number; sales30: { orders: number; sales: number; cash: number }; checklist: Checklist; usage: Usage };
type Member = { id: string; name: string; phone: string; role: keyof typeof ROLE_LABEL; venueName: string; active: boolean; createdAt: string };
type Bill = { id: string; month: string; number: string; totalPaise: number; status: string; paidAt: string | null; reference: string | null };
type Entry = { id: number; action: string; staffName: string | null; at: string };
type Data = { vendor: Vendor; venues: Venue[]; team: Member[]; bills: Bill[]; activity: Entry[] };

const TABS = [['overview', 'Venues'], ['setup', 'Setup checklist'], ['details', 'Business details'], ['logins', 'Logins'], ['plan', 'Plan & bills'], ['notes', 'Notes'], ['activity', 'Activity']] as const;

export function VendorDetail({ id, nav }: { id: string; nav: Nav }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('overview');
  const load = useCallback(() => api<Data>(`/api/admin/vendors/${id}`).then(setD).catch(e => setErr((e as Error).message)), [id]);
  useEffect(() => { load(); }, [load]);
  if (err) return <p className="py-24 text-center text-muted">{err}</p>;
  if (!d) return <div className="grid place-items-center py-24"><Spinner className="text-muted" /></div>;
  const v = d.vendor;
  const owner = d.team.find(m => m.role === 'owner');

  const patch = async (body: Record<string, unknown>, msg: string) => {
    try { await api(`/api/admin/vendors/${v.id}`, { method: 'PATCH', body }); toast(msg); await load(); return true; }
    catch (e) { toast((e as Error).message, 'bad'); return false; }
  };
  const suspend = async () => {
    const s = v.status === 'active';
    if (!(await confirm({ title: s ? `Suspend ${v.name}?` : `Reactivate ${v.name}?`, body: s ? 'All their QR codes stop taking orders immediately. Staff can still log in and see past data. Use this for unpaid bills or serious complaints.' : 'Their QR codes start taking orders again right away.', confirm: s ? 'Suspend vendor' : 'Reactivate', tone: s ? 'danger' : 'primary' }))) return;
    patch({ status: s ? 'suspended' : 'active' }, s ? 'Vendor suspended' : 'Vendor is active again');
  };
  const stage = async () => {
    const live = v.stage === 'setup';
    const notReady = d.venues.filter(x => !x.checklist.ready);
    if (!(await confirm({
      title: live ? `Mark ${v.name} as live?` : `Move ${v.name} back to setup?`,
      body: live ? (notReady.length ? <>Heads-up: <b>{notReady.map(x => x.name).join(', ')}</b> still {notReady.length === 1 ? 'has' : 'have'} required setup steps open. Monthly fees start from the month they go live.</> : 'Their setup is complete. Monthly fees start from this month.') : 'They show as “Setting up” again. Ordering keeps working.',
      confirm: live ? 'Mark as live' : 'Move to setup', tone: 'primary',
    }))) return;
    patch({ stage: live ? 'live' : 'setup' }, live ? `${v.name} is live` : 'Moved back to setup');
  };

  return (
    <div>
      <button onClick={() => nav.go('vendors')} className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft size={16} />All vendors</button>
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <Logo name={v.name} color={v.brandColor} url={v.logoUrl} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold">{v.name}<VendorStatus status={v.status} stage={v.stage} />{v.isDemo && <DemoBadge />}</h1>
          <p className="text-sm text-muted">{[v.legalName, owner && `Owner ${owner.name} · ${owner.phone}`, `Joined ${day(v.createdAt)}`].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {d.venues[0] && <Btn tone="outline" onClick={() => nav.openVenue(d.venues[0].id)}><ExternalLink size={15} />Open their dashboard</Btn>}
          <Btn tone={v.stage === 'setup' ? 'good' : 'outline'} onClick={stage}>{v.stage === 'setup' ? <><Rocket size={15} />Mark as live</> : <><Undo2 size={15} />Back to setup</>}</Btn>
          <Btn tone="danger" onClick={suspend}><Power size={15} />{v.status === 'active' ? 'Suspend' : 'Reactivate'}</Btn>
        </div>
      </div>

      {v.isDemo && <p className="mb-4 rounded-xl border border-dashed border-[#E8C08A] bg-[#FFF8EC] px-4 py-2.5 text-sm text-[#7A4A00]"><b>Demo vendor</b> with sample data, for showing Servd in pitches. Not counted in platform totals and never billed. Manage it from <b>Demo</b> in the menu.</p>}
      <div className="no-scrollbar mb-4 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold ${tab === k ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
            {l}{k === 'setup' && v.stage === 'setup' && <span className="ml-1.5 rounded-full bg-[#FFF3E0] px-1.5 text-[11px] text-[#9A5500]">{d.venues.reduce((a, x) => a + x.checklist.done, 0)}/{d.venues.reduce((a, x) => a + x.checklist.total, 0)}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && <VenuesTab d={d} nav={nav} reload={load} />}
      {tab === 'setup' && <SetupTab d={d} nav={nav} />}
      {tab === 'details' && <DetailsTab v={v} save={patch} />}
      {tab === 'logins' && <LoginsTab team={d.team} reload={load} />}
      {tab === 'plan' && <PlanTab v={v} bills={d.bills} save={patch} nav={nav} />}
      {tab === 'notes' && <NotesTab v={v} save={patch} />}
      {tab === 'activity' && (
        <Card><ul className="divide-y divide-line text-sm">{d.activity.map(a => <li key={a.id} className="flex justify-between gap-3 py-2"><span><b className="font-semibold">{a.staffName || 'System'}</b> · {a.action.replace(/_/g, ' ')}</span><span className="shrink-0 text-muted">{timeAgo(a.at)}</span></li>)}{!d.activity.length && <li className="py-2 text-muted">Nothing yet.</li>}</ul></Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- venues
function VenuesTab({ d, nav, reload }: { d: Data; nav: Nav; reload: () => Promise<unknown> }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [add, setAdd] = useState<{ name: string; type: string; serviceMode: string; city: string; taxBps: number } | null>(null);
  const total = d.venues.reduce((a, x) => ({ sales: a.sales + (x.sales30.sales || 0), orders: a.orders + x.sales30.orders, cash: a.cash + (x.sales30.cash || 0), qr: a.qr + x.usage.qr.sales }), { sales: 0, orders: 0, cash: 0, qr: 0 });
  const create = async () => {
    if (!add) return;
    if (!(await confirm({ title: `Add “${add.name}” to ${d.vendor.name}?`, body: 'The owner sees the new branch in their venue switcher and sets up its menu, QR codes and staff.', confirm: 'Add venue', tone: 'primary' }))) return;
    try { await api(`/api/admin/vendors/${d.vendor.id}/venues`, { body: add }); toast('Venue added'); setAdd(null); reload(); }
    catch (e) { toast((e as Error).message, 'bad'); }
  };
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Sales · 30 days" value={rupee(total.sales)} sub={`${total.orders} paid orders`} />
        <Kpi label="Guest QR share" value={total.sales ? `${Math.round((total.qr / total.sales) * 100)}%` : '—'} sub={`${rupee(total.qr)} ordered by guests`} />
        <Kpi label="Our commission · 30 days" value={rupee(Math.round(total.qr * d.vendor.commissionBps / 10000))} sub={`${pct(d.vendor.commissionBps)} of guest QR orders${d.vendor.trialEndsAt && new Date(d.vendor.trialEndsAt) > new Date() ? ' · trial: not charged' : ''}`} />
        <Kpi label="Venues" value={String(d.venues.length)} sub={`${d.team.filter(m => m.active).length} active logins`} />
      </div>
      <Card title="Venues" right={<Btn size="sm" tone="outline" onClick={() => setAdd({ name: '', type: d.venues[0]?.type || 'restaurant', serviceMode: DEFAULT_MODE[d.venues[0]?.type || 'restaurant'], city: d.venues[0]?.city || '', taxBps: 500 })}><Plus size={14} />Add a branch</Btn>}>
        <ul className="divide-y divide-line">
          {d.venues.map(x => (
            <li key={x.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">{x.name}{!x.isOpen && <Pill tone="warn">Orders paused</Pill>}</p>
                <p className="text-xs text-muted">{[TYPE_LABEL[x.type], MODE_LABEL[x.serviceMode], x.city, `GST ${x.taxBps / 100}%`, x.upiId ? `UPI ${x.upiId}` : 'No UPI ID yet'].filter(Boolean).join(' · ')}</p>
                <UsageLine u={x.usage} f={d.vendor.features} />
              </div>
              <Progress done={x.checklist.done} total={x.checklist.total} />
              <div className="tabular w-32 text-right text-sm"><b>{rupee(x.sales30.sales || 0)}</b><span className="block text-xs text-muted">{x.sales30.orders} orders · 30 d</span></div>
              <Btn size="sm" tone="outline" onClick={() => nav.openVenue(x.id)}>Open<ExternalLink size={13} /></Btn>
            </li>
          ))}
        </ul>
      </Card>
      <Sheet open={!!add} onClose={() => setAdd(null)} title="Add a branch" footer={<Btn tone="dark" className="w-full" disabled={(add?.name.trim().length || 0) < 2} onClick={create}>Add venue</Btn>}>
        {add && (
          <div className="grid gap-3 p-4">
            <Field label="Branch name"><input autoFocus className={inputCls} value={add.name} onChange={e => setAdd({ ...add, name: e.target.value })} placeholder="e.g. Brew Bay, Kondapur" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type"><select className={inputCls} value={add.type} onChange={e => setAdd({ ...add, type: e.target.value, serviceMode: DEFAULT_MODE[e.target.value] })}>{Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
              <Field label="City"><input className={inputCls} value={add.city} onChange={e => setAdd({ ...add, city: e.target.value })} /></Field>
            </div>
            <Field label="How ordering works"><select className={inputCls} value={add.serviceMode} onChange={e => setAdd({ ...add, serviceMode: e.target.value })}>{MODES_FOR[add.type].map(m => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}</select></Field>
            <Field label="GST on food"><select className={inputCls} value={add.taxBps} onChange={e => setAdd({ ...add, taxBps: Number(e.target.value) })}><option value={500}>5% (most restaurants, cafés, theaters)</option><option value={1800}>18%</option><option value={0}>No GST (not registered / composition)</option></select></Field>
          </div>
        )}
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------- setup checklist
function SetupTab({ d, nav }: { d: Data; nav: Nav }) {
  const toast = useToast();
  const owner = d.team.find(m => m.role === 'owner');
  const message = (x: Venue) => {
    const open = x.checklist.steps.filter(s => !s.done);
    return `Hi ${owner?.name || ''}, here's what's left to start taking orders at ${x.name} on Servd:\n${open.map((s, i) => `${i + 1}. ${s.label}: ${s.hint}`).join('\n')}\n\nLog in at ${window.location.origin}/staff/login with your mobile number and PIN. Reply here if you need help!`;
  };
  return (
    <div className="space-y-4">
      {d.venues.map(x => (
        <Card key={x.id} title={<>{x.name} <span className="font-normal text-muted">· {x.checklist.done}/{x.checklist.total} done</span></>}
          right={x.checklist.ready ? <Pill tone="good">Ready to take orders</Pill> : <Pill tone="warn">Required steps open</Pill>}>
          <ul className="space-y-1">
            {x.checklist.steps.map(s => (
              <li key={s.key} className="flex items-start gap-3 rounded-xl p-2">
                {s.done ? <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-good text-white"><Check size={14} strokeWidth={3} /></span> : <Circle size={24} className="shrink-0 text-faint" />}
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${s.done ? 'text-muted line-through decoration-faint' : ''}`}>{s.label} {!s.required && <span className="font-normal text-muted no-underline">(recommended)</span>}</p>
                  {!s.done && <p className="text-xs text-muted">{s.hint}</p>}
                </div>
              </li>
            ))}
          </ul>
          {x.checklist.done < x.checklist.total && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
              <Btn size="sm" tone="outline" onClick={() => nav.openVenue(x.id)}><ExternalLink size={13} />Open venue and help set up</Btn>
              <Btn size="sm" tone="outline" onClick={() => { navigator.clipboard?.writeText(message(x)); toast('Message copied'); }}><Copy size={13} />Copy reminder</Btn>
              {owner && <a className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-[#128C4B] hover:bg-soft" target="_blank" rel="noreferrer" href={`https://wa.me/91${owner.phone}?text=${encodeURIComponent(message(x))}`}><MessageCircle size={14} />Send on WhatsApp</a>}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- business details
function DetailsTab({ v, save }: { v: Vendor; save: (b: Record<string, unknown>, m: string) => Promise<boolean> }) {
  const confirm = useConfirm();
  const init = { name: v.name, legalName: v.legalName || '', contactName: v.contactName || '', phone: v.phone || '', email: v.email || '', gstin: v.gstin || '', fssai: v.fssai || '', address: v.address || '', brandColor: v.brandColor, invoicePrefix: v.invoicePrefix || '' };
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  const changed = JSON.stringify(f) !== JSON.stringify(init);
  const submit = async () => {
    if (!(await confirm({ title: 'Save business details?', body: 'The name, legal name, GSTIN, FSSAI and address print on this vendor’s menu and on every new bill.', confirm: 'Save', tone: 'primary' }))) return;
    setBusy(true); await save(f, 'Details saved'); setBusy(false);
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Card>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Brand name (customers see this)"><input className={inputCls} value={f.name} onChange={set('name')} /></Field>
        <Field label="Legal name (on bills)"><input className={inputCls} value={f.legalName} onChange={set('legalName')} placeholder="e.g. Aurora Entertainment Pvt Ltd" /></Field>
        <Field label="Contact person"><input className={inputCls} value={f.contactName} onChange={set('contactName')} /></Field>
        <Field label="Business phone"><input className={inputCls} value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Email (for our monthly bills)"><input className={inputCls} type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Brand color"><div className="flex gap-2"><input type="color" value={f.brandColor} onChange={set('brandColor')} className="h-11 w-14 rounded-xl border border-line" aria-label="Brand color" /><input className={`${inputCls} font-mono`} value={f.brandColor} onChange={set('brandColor')} /></div></Field>
        <Field label="GSTIN" hint="15 characters. Leave empty if not GST registered."><input className={`${inputCls} uppercase`} maxLength={15} value={f.gstin} onChange={set('gstin')} /></Field>
        <Field label="FSSAI licence number" hint="14 digits"><input className={inputCls} inputMode="numeric" maxLength={14} value={f.fssai} onChange={set('fssai')} /></Field>
        <Field label="Bill number prefix" hint={<>Bills are numbered <b>{(f.invoicePrefix || v.invoicePrefixShown).toUpperCase()}/2627/00001</b>. Change only before their first bill.</>}><input className={`${inputCls} uppercase`} maxLength={5} value={f.invoicePrefix} onChange={set('invoicePrefix')} placeholder={v.invoicePrefixShown} /></Field>
        <Field label="Registered address" className="sm:col-span-2"><textarea rows={2} className={inputCls} value={f.address} onChange={set('address')} /></Field>
      </div>
      <div className="mt-4 flex justify-end gap-2"><Btn tone="ghost" disabled={!changed} onClick={() => setF(init)}>Undo changes</Btn><Btn tone="dark" loading={busy} disabled={!changed} onClick={submit}>Save details</Btn></div>
    </Card>
  );
}

// ---------------------------------------------------------------- logins
function LoginsTab({ team, reload }: { team: Member[]; reload: () => Promise<unknown> }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [shown, setShown] = useState<{ name: string; phone: string; pin: string } | null>(null);
  const resetPin = async (m: Member) => {
    const pin = makePin();
    if (!(await confirm({ title: `Reset ${m.name}’s PIN?`, body: <>Their new PIN will be <b className="tabular tracking-widest">{pin}</b>. They are logged out on every device and must use the new PIN.</>, confirm: 'Reset PIN', tone: 'danger' }))) return;
    try { await api(`/api/admin/staff/${m.id}`, { body: { action: 'reset_pin', pin } }); setShown({ name: m.name, phone: m.phone, pin }); reload(); }
    catch (e) { toast((e as Error).message, 'bad'); }
  };
  const toggle = async (m: Member) => {
    if (!(await confirm({ title: m.active ? `Turn off ${m.name}’s login?` : `Turn ${m.name}’s login back on?`, body: m.active ? 'They are logged out everywhere immediately.' : 'They can log in with their phone number and PIN again.', confirm: m.active ? 'Turn off' : 'Turn on', tone: m.active ? 'danger' : 'primary' }))) return;
    try { await api(`/api/admin/staff/${m.id}`, { body: { action: 'set_active', active: !m.active } }); toast(m.active ? 'Login turned off' : 'Login turned on'); reload(); }
    catch (e) { toast((e as Error).message, 'bad'); }
  };
  const msg = shown ? `Your Servd login: ${window.location.origin}/staff/login\nMobile: ${shown.phone}\nNew PIN: ${shown.pin}\nPlease don't share your PIN.` : '';
  return (
    <Card title="Logins" right={<span className="text-xs text-muted">Owners add their own staff from their dashboard.</span>}>
      <ul className="divide-y divide-line">
        {team.map(m => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold">{m.name}<Pill tone={m.role === 'owner' ? 'brand' : 'neutral'}>{ROLE_LABEL[m.role]}</Pill>{!m.active && <Pill tone="bad">Off</Pill>}</p>
              <p className="tabular text-xs text-muted">{m.phone}{m.venueName ? ` · ${m.venueName}` : ''}</p>
            </div>
            <Btn size="sm" tone="outline" onClick={() => resetPin(m)}><KeyRound size={13} />Reset PIN</Btn>
            <Btn size="sm" tone="ghost" onClick={() => toggle(m)}>{m.active ? 'Turn off' : 'Turn on'}</Btn>
          </li>
        ))}
      </ul>
      <Sheet open={!!shown} onClose={() => setShown(null)} title="New PIN set">
        {shown && (
          <div className="space-y-3 p-4">
            <p className="text-sm text-ink-2">Share this with <b>{shown.name}</b> privately. It is shown only once.</p>
            <pre className="rounded-xl bg-soft p-3 text-sm whitespace-pre-wrap">{msg}</pre>
            <div className="flex gap-2">
              <Btn tone="outline" className="flex-1" onClick={() => { navigator.clipboard?.writeText(msg); toast('Copied'); }}><Copy size={15} />Copy</Btn>
              <a className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#128C4B] px-4 py-2.5 text-sm font-semibold text-white" target="_blank" rel="noreferrer" href={`https://wa.me/91${shown.phone}?text=${encodeURIComponent(msg)}`}><MessageCircle size={15} />WhatsApp</a>
            </div>
          </div>
        )}
      </Sheet>
    </Card>
  );
}

// How a venue actually uses Servd (last 30 days): where orders come from, and which modules are in use.
function UsageLine({ u, f }: { u: Usage; f: Features }) {
  const all = u.qr.orders + u.counter.orders + u.apps.orders;
  const share = (x: Src) => (all ? Math.round((x.orders / all) * 100) : 0);
  const lowQr = all >= 20 && share(u.qr) < 25;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
      {all ? <>
        <Pill tone={lowQr ? 'warn' : 'brand'}>Guest QR {share(u.qr)}%</Pill>
        {u.counter.orders > 0 && <Pill>Counter {share(u.counter)}%</Pill>}
        {u.apps.orders > 0 && <Pill>Zomato / Swiggy {share(u.apps)}%</Pill>}
      </> : <Pill tone="neutral">No orders in 30 days</Pill>}
      <span className="text-muted">Last order {u.lastOrderAt ? timeAgo(u.lastOrderAt) : 'never'}</span>
      {f.inventory && <span className="text-muted">· Stock {u.materials ? `${u.materials} materials` : 'not set up'}</span>}
      {f.pos && <span className="text-muted">· Cash drawer {u.drawerDays ? `used ${u.drawerDays}×` : 'not used'}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- plan & bills
function PlanTab({ v, bills, save, nav }: { v: Vendor; bills: Bill[]; save: (b: Record<string, unknown>, m: string) => Promise<boolean>; nav: Nav }) {
  const confirm = useConfirm();
  const init = { commission: String(v.commissionBps / 100), fee: String(v.monthlyFeePaise / 100), trial: v.trialEndsAt ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(v.trialEndsAt)) : '' };
  const [f, setF] = useState(init);
  const changed = JSON.stringify(f) !== JSON.stringify(init);
  const bps = Math.round(Number(f.commission) * 100), fee = Math.round(Number(f.fee) * 100);
  const valid = Number.isFinite(bps) && bps >= 0 && bps <= 3000 && Number.isFinite(fee) && fee >= 0;
  const submit = async () => {
    if (!(await confirm({ title: 'Change this vendor’s plan?', body: <>New plan: <b>{f.commission}%</b> of guest QR orders{fee ? <> + <b>{rupee(fee)}</b> a month</> : ''}{f.trial ? <>, free until <b>{day(f.trial)}</b></> : ''}. It applies to this month’s bill if it hasn’t been recorded yet. Tell the vendor before you change it.</>, confirm: 'Change plan', tone: 'primary' }))) return;
    save({ commissionBps: bps, monthlyFeePaise: fee, trialEndsAt: f.trial || null }, 'Plan updated');
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <Card title="Plan">
        <div className="grid gap-3">
          <Field label="Commission on guest QR orders (%)" hint="Orders their staff bill at the counter carry no commission."><input className={inputCls} inputMode="decimal" value={f.commission} onChange={e => setF({ ...f, commission: e.target.value })} /></Field>
          <Field label="Monthly fee (₹)" hint="0 = no monthly fee"><input className={inputCls} inputMode="numeric" value={f.fee} onChange={e => setF({ ...f, fee: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
          <Field label="Free trial until" hint="No commission or fee for orders before this date. Leave empty for no trial."><input type="date" className={inputCls} value={f.trial} onChange={e => setF({ ...f, trial: e.target.value })} /></Field>
        </div>
        <div className="mt-4 flex justify-end"><Btn tone="dark" disabled={!changed || !valid} onClick={submit}>Save plan</Btn></div>
      </Card>
      <Modules v={v} save={save} />
      <Card title="Monthly bills from us" right={<Btn size="sm" tone="outline" onClick={() => nav.go('billing')}>Open billing</Btn>}>
        <ul className="divide-y divide-line text-sm">
          {bills.map(b => (
            <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
              <span><b className="font-semibold">{new Date(`${b.month}-15`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</b><span className="block text-xs text-muted">{b.number}{b.reference ? ` · ref ${b.reference}` : ''}</span></span>
              <span className="flex items-center gap-2"><span className="tabular font-bold">{rupee(b.totalPaise)}</span><Pill tone={b.status === 'paid' ? 'good' : b.status === 'waived' ? 'neutral' : 'warn'}>{b.status === 'paid' ? 'Paid' : b.status === 'waived' ? 'Waived' : 'Due'}</Pill>
                <a href={`/print/platform-bill/${b.id}`} target="_blank" className="text-xs font-semibold text-brand-text">View</a></span>
            </li>
          ))}
          {!bills.length && <li className="py-3 text-muted">No bills recorded yet. Record them from Billing at the end of each month.</li>}
        </ul>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- notes
function NotesTab({ v, save }: { v: Vendor; save: (b: Record<string, unknown>, m: string) => Promise<boolean> }) {
  const [t, setT] = useState(v.notes);
  return (
    <Card title="Internal notes" right={<span className="text-xs text-muted">Only the platform team sees these.</span>}>
      <textarea rows={10} className={inputCls} value={t} onChange={e => setT(e.target.value)} placeholder="Agreements, contacts, special requests, issues…" />
      <div className="mt-3 flex justify-end"><Btn tone="dark" disabled={t === v.notes} onClick={() => save({ notes: t }, 'Notes saved')}>Save notes</Btn></div>
    </Card>
  );
}

const MODULES: { key: keyof Features; label: string; hint: string }[] = [
  { key: 'pos', label: 'Billing (POS) & cash drawer', hint: 'Staff take orders at the counter or table, takeaway, delivery, Zomato / Swiggy entry, split payments, cash drawer.' },
  { key: 'inventory', label: 'Inventory', hint: 'Raw materials, recipes, automatic stock deduction, purchases, wastage, low-stock alerts.' },
  { key: 'customers', label: 'Customer list', hint: 'Every guest with visits, spend and favourite dish; Excel download for offers.' },
];
// Which paid modules this vendor's plan includes. Guest QR ordering, KOTs, tables, reports and GST bills are always included.
function Modules({ v, save }: { v: Vendor; save: (b: Record<string, unknown>, m: string) => Promise<boolean> }) {
  const confirm = useConfirm();
  const flip = async (k: keyof Features) => {
    const on = !v.features[k];
    const m = MODULES.find(x => x.key === k)!;
    if (!(await confirm({
      title: on ? `Switch on ${m.label} for ${v.name}?` : `Switch off ${m.label} for ${v.name}?`,
      body: on ? 'It appears in their staff app right away.' : 'It disappears from their staff app right away. Their data is kept and comes back if you switch it on again.',
      confirm: on ? 'Switch on' : 'Switch off', tone: on ? 'primary' : 'danger',
    }))) return;
    save({ features: { [k]: on } }, on ? `${m.label} switched on` : `${m.label} switched off`);
  };
  return (
    <Card title="Modules in their plan" right={<span className="text-xs text-muted">QR ordering, KOTs, tables, reports and GST bills are always included</span>}>
      <ul className="divide-y divide-line">
        {MODULES.map(m => (
          <li key={m.key} className="flex items-center justify-between gap-4 py-3">
            <span><b className="text-sm font-semibold">{m.label}</b><span className="block text-xs text-muted">{m.hint}</span></span>
            <Toggle on={v.features[m.key]} onChange={() => flip(m.key)} label={m.label} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

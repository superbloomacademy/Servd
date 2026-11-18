'use client';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink, MessageCircle, RefreshCw } from 'lucide-react';
import { api, ApiFail, hhmm, rupee } from '@/lib/client';
import { Btn, Field, inputCls } from '@/components/ui/kit';
import { useConfirm, useToast } from '@/components/ui/providers';
import { DEFAULT_MODE, MODES_FOR, MODE_HELP, MODE_LABEL, TYPE_LABEL, makePin } from './common';
import type { Nav } from './super-admin';

export type OnboardPrefill = Partial<{ leadId: string; vendorName: string; contactName: string; ownerName: string; ownerPhone: string; email: string; city: string; type: string }>;

const STEPS = ['Business', 'First venue', 'Owner login', 'Plan', 'Review'] as const;
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const TYPE_EMOJI_FREE: Record<string, string> = { theater: 'Seats, shows, interval delivery', restaurant: 'Tables, rounds, one bill', cafe: 'Tables or counter', stall: 'One QR at the counter' };

type Created = { vendor: { id: string; name: string }; venue: { id: string; name: string }; owner: { name: string; phone: string }; pin: string };

// Onboarding a new vendor in 5 short steps. Creates: the business, its first venue, a kitchen station, and the owner's login.
// Afterwards the owner finishes setup (menu, QR codes, staff) from their own dashboard, guided by a checklist.
export function Onboard({ nav, prefill }: { nav: Nav; prefill?: OnboardPrefill }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<Created | null>(null);
  const type0 = prefill?.type && TYPE_LABEL[prefill.type] ? prefill.type : 'restaurant';
  const [f, setF] = useState({
    vendorName: prefill?.vendorName || '', legalName: '', contactName: prefill?.contactName || '', businessPhone: '', email: prefill?.email || '',
    gstin: '', fssai: '', address: '', brandColor: '#E23744',
    venueName: '', type: type0, serviceMode: DEFAULT_MODE[type0], city: prefill?.city || '', taxBps: 500, openTime: '10:00', closeTime: '23:00', allDay: false, upiId: '',
    ownerName: prefill?.ownerName || '', ownerPhone: prefill?.ownerPhone || '', ownerPin: makePin(),
    commission: '2', fee: '0', trialDays: 30, features: { pos: true, inventory: true, customers: true },
  });
  const set = <K extends keyof typeof f>(k: K, val: (typeof f)[K]) => { setF(p => ({ ...p, [k]: val })); setErr(''); };
  const inp = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(k, e.target.value as never);

  // What's missing on each step (shown under the Next button).
  const problem = [
    f.vendorName.trim().length < 2 ? 'Enter the business name.'
      : f.gstin && !GSTIN.test(f.gstin.toUpperCase()) ? 'GSTIN should be 15 characters, like 36ABCDE1234F1Z5.'
      : f.fssai && !/^\d{14}$/.test(f.fssai) ? 'FSSAI licence number is 14 digits.'
      : f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email) ? 'Email looks wrong.' : '',
    f.venueName.trim().length < 2 ? 'Enter the venue or branch name.'
      : f.upiId && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(f.upiId) ? 'UPI ID looks wrong, e.g. shopname@okaxis.' : '',
    f.ownerName.trim().length < 2 ? 'Enter the owner’s name.' : !/^[6-9]\d{9}$/.test(f.ownerPhone) ? 'Enter the owner’s 10-digit mobile number.' : !/^\d{4,6}$/.test(f.ownerPin) ? 'PIN must be 4–6 digits.' : '',
    !(Number(f.commission) >= 0 && Number(f.commission) <= 30) ? 'Commission must be between 0 and 30%.' : !(Number(f.fee) >= 0) ? 'Enter a monthly fee (0 for none).' : '',
    '',
  ][step];

  const create = async () => {
    const ok = await confirm({
      title: `Onboard ${f.vendorName}?`,
      body: <>This creates the business, its first venue <b>{f.venueName}</b>, and an owner login for <b>+91 {f.ownerPhone}</b>. You’ll get a message to send them with their login.</>,
      confirm: 'Create vendor', tone: 'primary',
    });
    if (!ok) return;
    setBusy(true); setErr('');
    try {
      const r = await api<Omit<Created, 'pin'>>('/api/admin/vendors', {
        body: {
          ...f, gstin: f.gstin.toUpperCase(), openTime: f.allDay ? '00:00' : f.openTime, closeTime: f.allDay ? '00:00' : f.closeTime,
          commissionBps: Math.round(Number(f.commission) * 100), monthlyFeePaise: Math.round(Number(f.fee) * 100), leadId: prefill?.leadId ?? null, features: f.features,
        },
      });
      setDone({ ...r, pin: f.ownerPin }); window.scrollTo(0, 0);
    } catch (e) {
      const code = e instanceof ApiFail ? e.code : undefined;
      setErr((e as Error).message);
      if (code === 'phone_taken') setStep(2);
    } finally { setBusy(false); }
  };

  if (done) return <Success d={done} nav={nav} toast={toast} />;

  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={() => nav.go(prefill?.leadId ? 'leads' : 'vendors')} className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft size={16} />Cancel</button>
      <h1 className="text-2xl font-extrabold">Onboard a vendor</h1>
      <p className="mt-1 text-sm text-muted">Takes about 3 minutes. Have their business details and the owner’s mobile number ready.{prefill?.leadId ? ' Details from the lead are filled in.' : ''}</p>

      <ol className="mt-5 flex gap-1.5">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <button disabled={i > step} onClick={() => setStep(i)} className="w-full text-left disabled:cursor-default">
              <span className={`block h-1.5 rounded-full ${i <= step ? 'bg-brand' : 'bg-line'}`} />
              <span className={`mt-1.5 hidden text-xs font-semibold sm:block ${i === step ? 'text-ink' : 'text-muted'}`}>{i + 1}. {s}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-5 rounded-2xl bg-white p-5 sm:p-6">
        {step === 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <h2 className="text-lg font-bold sm:col-span-2">About the business</h2>
            <Field label="Business / brand name" hint="Customers see this on the menu."><input autoFocus className={inputCls} value={f.vendorName} onChange={inp('vendorName')} placeholder="e.g. Brew Bay Café" /></Field>
            <Field label="Legal name" hint="As on their GST / FSSAI papers. Prints on bills."><input className={inputCls} value={f.legalName} onChange={inp('legalName')} placeholder="e.g. Brew Bay Foods LLP" /></Field>
            <Field label="GSTIN (optional)" hint="Can be added later by the owner."><input className={`${inputCls} uppercase`} maxLength={15} value={f.gstin} onChange={inp('gstin')} /></Field>
            <Field label="FSSAI licence no. (optional)"><input className={inputCls} inputMode="numeric" maxLength={14} value={f.fssai} onChange={e => set('fssai', e.target.value.replace(/\D/g, ''))} /></Field>
            <Field label="Business phone (optional)"><input className={inputCls} inputMode="tel" value={f.businessPhone} onChange={inp('businessPhone')} /></Field>
            <Field label="Email for our monthly bills (optional)"><input className={inputCls} type="email" value={f.email} onChange={inp('email')} /></Field>
            <Field label="Address (optional)" className="sm:col-span-2"><textarea rows={2} className={inputCls} value={f.address} onChange={inp('address')} /></Field>
            <Field label="Brand color" hint="Buttons and highlights on their menu. The owner can upload a logo later.">
              <div className="flex gap-2"><input type="color" value={f.brandColor} onChange={inp('brandColor')} className="h-11 w-14 rounded-xl border border-line" aria-label="Brand color" />
                <div className="flex flex-wrap gap-1.5">{['#E23744', '#6D28D9', '#0E7C66', '#C2410C', '#1D4ED8', '#1C1C1C'].map(c => <button key={c} type="button" onClick={() => set('brandColor', c)} aria-label={c} className={`h-11 w-9 rounded-lg ${f.brandColor === c ? 'ring-2 ring-ink ring-offset-2' : ''}`} style={{ background: c }} />)}</div></div>
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Their first venue</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.entries(TYPE_LABEL).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setF(p => ({ ...p, type: k, serviceMode: DEFAULT_MODE[k] }))}
                  className={`rounded-xl border-2 p-3 text-left ${f.type === k ? 'border-ink bg-soft' : 'border-line hover:bg-soft'}`}>
                  <span className="block font-bold">{l}</span><span className="block text-xs text-muted">{TYPE_EMOJI_FREE[k]}</span>
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Venue / branch name"><input autoFocus className={inputCls} value={f.venueName} onChange={inp('venueName')} placeholder={f.vendorName ? `${f.vendorName}, ${f.city || 'Madhapur'}` : 'e.g. Brew Bay, Madhapur'} /></Field>
              <Field label="City"><input className={inputCls} value={f.city} onChange={inp('city')} /></Field>
            </div>
            <div>
              <p className="mb-1.5 text-[13px] font-semibold text-ink-2">How ordering works</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {MODES_FOR[f.type].map(m => (
                  <button key={m} type="button" onClick={() => set('serviceMode', m)} className={`rounded-xl border-2 p-3 text-left ${f.serviceMode === m ? 'border-ink bg-soft' : 'border-line hover:bg-soft'}`}>
                    <span className="flex items-center justify-between font-bold">{MODE_LABEL[m]}{f.serviceMode === m && <Check size={16} />}</span>
                    <span className="block text-xs text-muted">{MODE_HELP[m]}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="GST on food"><select className={inputCls} value={f.taxBps} onChange={e => set('taxBps', Number(e.target.value))}><option value={500}>5% (most restaurants, cafés, theaters)</option><option value={1800}>18%</option><option value={0}>No GST (not registered / composition)</option></select></Field>
              <Field label="Their UPI ID (optional)" hint="Customers pay straight to this. The owner can add it later."><input className={inputCls} value={f.upiId} onChange={e => set('upiId', e.target.value.trim())} placeholder="shopname@okaxis" /></Field>
              <Field label="Opening hours" className="sm:col-span-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input type="time" disabled={f.allDay} className={`${inputCls} w-auto`} value={f.openTime} onChange={inp('openTime')} /><span className="text-muted">to</span>
                  <input type="time" disabled={f.allDay} className={`${inputCls} w-auto`} value={f.closeTime} onChange={inp('closeTime')} />
                  <label className="ml-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.allDay} onChange={e => set('allDay', e.target.checked)} />Open 24 hours</label>
                </div>
              </Field>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <h2 className="text-lg font-bold sm:col-span-2">Owner’s login</h2>
            <p className="-mt-1 text-sm text-muted sm:col-span-2">The owner logs in at <b>/staff/login</b> with their mobile number and this PIN. They can then add staff, menu and QR codes.</p>
            <Field label="Owner’s name"><input autoFocus className={inputCls} value={f.ownerName} onChange={inp('ownerName')} /></Field>
            <Field label="Owner’s mobile number">
              <div className="flex items-center rounded-xl border border-line focus-within:border-ink"><span className="border-r border-line px-3 py-2.5 text-[15px] text-muted">+91</span>
                <input inputMode="numeric" maxLength={10} value={f.ownerPhone} onChange={e => set('ownerPhone', e.target.value.replace(/\D/g, ''))} className="w-full rounded-r-xl px-3 py-2.5 text-[15px] outline-none" /></div>
            </Field>
            <Field label="First PIN" hint="We made a random one. They should keep it private.">
              <div className="flex gap-2"><input className={`${inputCls} tabular tracking-[0.3em]`} inputMode="numeric" maxLength={6} value={f.ownerPin} onChange={e => set('ownerPin', e.target.value.replace(/\D/g, ''))} />
                <Btn type="button" tone="outline" onClick={() => set('ownerPin', makePin())} aria-label="New random PIN"><RefreshCw size={16} /></Btn></div>
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">What they pay us</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Commission on guest QR orders (%)" hint="e.g. 2 = ₹2 on a ₹100 order. Orders their staff bill at the counter are free."><input className={inputCls} inputMode="decimal" value={f.commission} onChange={e => set('commission', e.target.value.replace(/[^\d.]/g, ''))} /></Field>
              <Field label="Monthly fee (₹)" hint="0 = no monthly fee"><input className={inputCls} inputMode="numeric" value={f.fee} onChange={e => set('fee', e.target.value.replace(/[^\d.]/g, ''))} /></Field>
            </div>
            <div>
              <p className="mb-1.5 text-[13px] font-semibold text-ink-2">Free trial</p>
              <div className="flex flex-wrap gap-2">{[0, 14, 30, 60, 90].map(n => (
                <button key={n} type="button" onClick={() => set('trialDays', n)} className={`rounded-full border px-4 py-2 text-sm font-semibold ${f.trialDays === n ? 'border-ink bg-ink text-white' : 'border-line hover:bg-soft'}`}>{n ? `${n} days` : 'No trial'}</button>
              ))}</div>
              <p className="mt-1.5 text-xs text-muted">During the trial we charge no commission and no monthly fee.</p>
            </div>
            <div>
              <p className="mb-1.5 text-[13px] font-semibold text-ink-2">Modules <span className="font-normal text-muted">· guest QR ordering, KOTs, tables, reports and GST bills are always included</span></p>
              <div className="flex flex-wrap gap-2">
                {([['pos', 'Billing (POS) & cash drawer'], ['inventory', 'Inventory'], ['customers', 'Customer list']] as const).map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={f.features[k]} onClick={() => set('features', { ...f.features, [k]: !f.features[k] })}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold ${f.features[k] ? 'border-ink bg-ink text-white' : 'border-line text-muted hover:bg-soft'}`}>{f.features[k] ? '✓ ' : ''}{l}</button>
                ))}
              </div>
            </div>
            <div className="rounded-xl bg-soft p-4 text-sm">
              <b>Example:</b> at ₹50,000 of guest QR orders a month they would pay {rupee(Math.round(5_000_000 * Number(f.commission || 0) / 100))} commission{Number(f.fee) ? ` + ${rupee(Number(f.fee) * 100)} fee` : ''} = <b>{rupee(Math.round(5_000_000 * Number(f.commission || 0) / 100) + Number(f.fee || 0) * 100)}</b> a month{f.trialDays ? `, starting after ${f.trialDays} free days` : ''}.
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 className="mb-3 text-lg font-bold">Check and create</h2>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Item k="Business" v={<>{f.vendorName}{f.legalName && <span className="block text-muted">{f.legalName}</span>}</>} onEdit={() => setStep(0)} />
              <Item k="GSTIN / FSSAI" v={`${f.gstin.toUpperCase() || 'Not given'} / ${f.fssai || 'Not given'}`} onEdit={() => setStep(0)} />
              <Item k="First venue" v={<>{f.venueName} · {TYPE_LABEL[f.type]}{f.city ? `, ${f.city}` : ''}<span className="block text-muted">{MODE_LABEL[f.serviceMode]} · GST {f.taxBps / 100}%</span></>} onEdit={() => setStep(1)} />
              <Item k="Hours / UPI" v={`${f.allDay ? 'Open 24 hours' : `${hhmm(f.openTime)} – ${hhmm(f.closeTime)}`} · ${f.upiId || 'UPI later'}`} onEdit={() => setStep(1)} />
              <Item k="Owner login" v={<>{f.ownerName} · +91 {f.ownerPhone}<span className="block text-muted">PIN {f.ownerPin}</span></>} onEdit={() => setStep(2)} />
              <Item k="Plan" v={`${f.commission}% per QR order${Number(f.fee) ? ` + ₹${f.fee}/month` : ''}${f.trialDays ? ` · ${f.trialDays}-day free trial` : ''}${Object.values(f.features).every(Boolean) ? ' · all modules' : ` · modules: ${[f.features.pos && 'Billing', f.features.inventory && 'Inventory', f.features.customers && 'Customers'].filter(Boolean).join(', ') || 'QR only'}`}`} onEdit={() => setStep(3)} />
            </dl>
          </div>
        )}

        {(err || problem) && <p className="mt-4 text-sm text-bad">{err || problem}</p>}
        <div className="mt-6 flex items-center justify-between gap-2 border-t border-line pt-4">
          <Btn tone="ghost" disabled={step === 0} onClick={() => setStep(s => s - 1)}><ArrowLeft size={16} />Back</Btn>
          {step < STEPS.length - 1
            ? <Btn tone="dark" disabled={!!problem} onClick={() => setStep(s => s + 1)}>Next<ArrowRight size={16} /></Btn>
            : <Btn tone="brand" loading={busy} onClick={create}><Check size={16} />Create vendor</Btn>}
        </div>
      </div>
    </div>
  );
}

function Item({ k, v, onEdit }: { k: string; v: React.ReactNode; onEdit: () => void }) {
  return <div className="rounded-xl border border-line p-3"><dt className="flex justify-between text-xs font-semibold text-muted">{k}<button className="text-brand-text" onClick={onEdit}>Edit</button></dt><dd className="mt-1">{v}</dd></div>;
}

function Success({ d, nav, toast }: { d: Created; nav: Nav; toast: (t: string, tone?: 'ok' | 'bad') => void }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const msg = `Welcome to Servd, ${d.owner.name}! 🎉\n\nYour dashboard: ${origin}/staff/login\nMobile: ${d.owner.phone}\nPIN: ${d.pin}\n\nWhen you log in, the "Get started" page walks you through it:\n1. Business details & UPI ID\n2. Your menu\n3. Seats or tables, and QR codes\n4. A test order\n\nPlease keep your PIN private. Call us anytime for help.`;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl bg-white p-6 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-good text-white"><Check size={28} strokeWidth={3} /></div>
        <h1 className="mt-3 text-2xl font-extrabold">{d.vendor.name} is onboarded</h1>
        <p className="mt-1 text-sm text-muted">Venue “{d.venue.name}” and the owner’s login are ready. Send the owner their login now.</p>
      </div>
      <div className="mt-4 rounded-2xl bg-white p-5">
        <h2 className="font-bold">Message for the owner</h2>
        <pre className="mt-2 rounded-xl bg-soft p-3 text-sm whitespace-pre-wrap">{msg}</pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <a className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#128C4B] px-4 py-2.5 text-sm font-semibold text-white" target="_blank" rel="noreferrer" href={`https://wa.me/91${d.owner.phone}?text=${encodeURIComponent(msg)}`}><MessageCircle size={16} />Send on WhatsApp</a>
          <Btn tone="outline" className="flex-1" onClick={() => { navigator.clipboard?.writeText(msg); toast('Message copied'); }}><Copy size={16} />Copy message</Btn>
        </div>
        <p className="mt-2 text-xs text-muted">The PIN is shown only here. If it’s lost, reset it from the vendor’s Logins tab.</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Btn tone="dark" onClick={() => nav.go('vendors', { vendor: d.vendor.id })}>Open vendor</Btn>
        <Btn tone="outline" onClick={() => nav.openVenue(d.venue.id)}><ExternalLink size={15} />Set up their venue now</Btn>
        <Btn tone="ghost" onClick={() => nav.go('onboard')}>Onboard another</Btn>
      </div>
    </div>
  );
}

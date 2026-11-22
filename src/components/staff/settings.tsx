'use client';
import { useEffect, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { api, shrinkImage } from '@/lib/client';
import { brandVars } from '@/lib/theme';
import { Btn, Field, Spinner, Toggle, inputCls } from '@/components/ui/kit';
import { useConfirm, useToast } from '@/components/ui/providers';
import { PageHead } from './shell';
import type { VenueCtx } from './types';

type Settings = { acceptCash: boolean; unpaidCancelMin: number; startBeforePayment: boolean; rescanMinutes: number; sessionHours: number; pauseLastMin: number; showWindowBeforeMin: number; roundOff?: boolean; approveFirstOrder?: boolean };
type VenueRow = { id: string; name: string; type: string; serviceMode: string; address: string | null; city: string | null; upiId: string | null; upiName: string | null; upiQrUrl: string | null; taxBps: number; isOpen: boolean; openTime: string; closeTime: string; settings: Settings };
type Vendor = { id: string; name: string; logoUrl: string | null; brandColor: string; legalName: string | null; gstin: string | null; fssai: string | null; address: string | null; phone: string | null };

const MODES = [
  ['seat_delivery', 'Seat delivery', 'Theaters. Pay first, runner brings it to the seat (now or at interval).'],
  ['table_bill', 'Table service · running bill', 'Restaurants / open-bill cafés. Order in rounds, pay once at the end.'],
  ['table_prepay', 'Table service · pay first', 'Cafés that serve. Pay each order first, staff serve it to the table.'],
  ['counter_token', 'Counter pickup', 'Self-service. Pay first, collect with the KOT number.'],
  ['shop_qr', 'Single shop QR', 'Food stalls. One QR, pay the shop’s UPI, collect with the KOT number.'],
] as const;

export function VenueSettings({ venue, onSaved }: { venue: VenueCtx; onSaved: () => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [v, setV] = useState<VenueRow | null>(null);
  const [b, setB] = useState<Vendor | null>(null);
  const [orig, setOrig] = useState<{ v: VenueRow; b: Vendor } | null>(null);
  const [busy, setBusy] = useState(false);
  const logo = useRef<HTMLInputElement>(null), upiQr = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([api<{ venue: VenueRow }>(`/api/staff/v/${venue.id}/settings`), api<{ vendor: Vendor }>(`/api/staff/vendor?vendorId=${venue.vendorId}`)])
      .then(([a, c]) => { setV(a.venue); setB(c.vendor); setOrig({ v: a.venue, b: c.vendor }); });
  }, [venue.id, venue.vendorId]);
  if (!v || !b || !orig) return <div className="grid place-items-center py-24"><Spinner className="text-muted" /></div>;

  const upload = async (file: File, to: 'logo' | 'upi') => {
    const fd = new FormData(); fd.append('file', await shrinkImage(file, to === 'logo' ? 512 : 1200));
    try { const r = await api<{ url: string }>('/api/staff/upload', { form: fd }); to === 'logo' ? setB({ ...b, logoUrl: r.url }) : setV({ ...v, upiQrUrl: r.url }); }
    catch (e) { toast((e as Error).message, 'bad'); }
  };
  const s = v.settings;
  const set = (patch: Partial<Settings>) => setV({ ...v, settings: { ...s, ...patch } });
  const modeChanged = v.serviceMode !== orig.v.serviceMode;

  const save = async () => {
    const ok = await confirm({
      title: 'Save these settings?',
      body: <>Customers see the changes immediately{modeChanged ? <>. <b>You are changing how ordering works</b> to “{MODES.find(m => m[0] === v.serviceMode)?.[1]}”. Tell your staff before saving.</> : '.'}</>,
      confirm: 'Save', tone: 'primary',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/api/staff/v/${venue.id}/settings`, { method: 'PATCH', body: {
        name: v.name, serviceMode: v.serviceMode, address: v.address || '', city: v.city || '', upiId: v.upiId || '', upiName: v.upiName || '', upiQrUrl: v.upiQrUrl,
        taxBps: v.taxBps, openTime: v.openTime, closeTime: v.closeTime, settings: s,
      } });
      await api('/api/staff/vendor', { method: 'PATCH', body: { vendorId: venue.vendorId, name: b.name, logoUrl: b.logoUrl, brandColor: b.brandColor, legalName: b.legalName || '', gstin: b.gstin || '', fssai: b.fssai || '', address: b.address || '' } });
      toast('Settings saved'); setOrig({ v, b }); onSaved();
    } catch (e) { toast((e as Error).message, 'bad'); } finally { setBusy(false); }
  };

  return (
    <div className="max-w-4xl pb-24">
      <PageHead title="Settings & brand" sub="Your brand appears on the customer menu, order tracking, KOT and bill. We only show a small “Powered by servd”." />

      <section className="rounded-2xl bg-white p-5">
        <h2 className="font-bold">Your brand</h2>
        <div className="mt-4 grid gap-5 md:grid-cols-[1fr_260px]">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Business name"><input className={inputCls} value={b.name} onChange={e => setB({ ...b, name: e.target.value })} /></Field>
            <Field label="Brand color"><div className="flex gap-2"><input type="color" value={b.brandColor} onChange={e => setB({ ...b, brandColor: e.target.value })} className="h-11 w-14 cursor-pointer rounded-xl border border-line" aria-label="Pick brand color" /><input className={`${inputCls} font-mono`} value={b.brandColor} onChange={e => setB({ ...b, brandColor: e.target.value })} /></div></Field>
            <Field label="Legal name (on bills)"><input className={inputCls} value={b.legalName || ''} onChange={e => setB({ ...b, legalName: e.target.value })} /></Field>
            <Field label="GSTIN"><input className={`${inputCls} font-mono uppercase`} value={b.gstin || ''} onChange={e => setB({ ...b, gstin: e.target.value.toUpperCase() })} /></Field>
            <Field label="FSSAI licence no."><input className={`${inputCls} font-mono`} value={b.fssai || ''} onChange={e => setB({ ...b, fssai: e.target.value })} /></Field>
            <Field label="Address on bills"><input className={inputCls} value={b.address || ''} onChange={e => setB({ ...b, address: e.target.value })} /></Field>
          </div>
          <div style={brandVars(b.brandColor)} className="rounded-2xl border border-line p-4">
            <p className="text-xs font-semibold text-muted">Preview</p>
            <div className="mt-3 flex items-center gap-3">
              <button onClick={() => logo.current?.click()} className="group relative" aria-label="Upload logo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {b.logoUrl ? <img src={b.logoUrl} alt="" className="h-14 w-14 rounded-xl border border-line object-cover" /> : <div className="grid h-14 w-14 place-items-center rounded-xl bg-brand text-xl font-extrabold text-brand-ink">{b.name.slice(0, 1)}</div>}
                <span className="absolute inset-0 grid place-items-center rounded-xl bg-black/45 text-white opacity-0 group-hover:opacity-100"><ImagePlus size={18} /></span>
              </button>
              <div><p className="font-extrabold">{b.name}</p><p className="text-xs text-muted">{v.name}</p></div>
            </div>
            <input ref={logo} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={e => e.target.files?.[0] && upload(e.target.files[0], 'logo')} />
            <div className="mt-4 flex gap-2"><span className="rounded-lg border border-brand-line px-4 py-1.5 text-sm font-extrabold text-brand-text">ADD</span><span className="flex-1 rounded-lg bg-brand py-1.5 text-center text-sm font-bold text-brand-ink">View cart</span></div>
            {b.logoUrl && <button onClick={() => setB({ ...b, logoUrl: null })} className="mt-3 text-xs font-semibold text-bad">Remove logo</button>}
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-2xl bg-white p-5">
        <h2 className="font-bold">How ordering works here</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {MODES.map(([k, l, d]) => (
            <button key={k} onClick={() => setV({ ...v, serviceMode: k })} className={`rounded-xl border p-3 text-left ${v.serviceMode === k ? 'border-ink bg-soft shadow-[inset_0_0_0_1px_var(--ink)]' : 'border-line'}`}><b className="text-sm">{l}</b><p className="text-xs text-muted">{d}</p></button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label="Venue name"><input className={inputCls} value={v.name} onChange={e => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="Opens at"><input type="time" className={inputCls} value={v.openTime} onChange={e => setV({ ...v, openTime: e.target.value })} /></Field>
          <Field label="Closes at" hint="Same as opening time = open 24 h"><input type="time" className={inputCls} value={v.closeTime} onChange={e => setV({ ...v, closeTime: e.target.value })} /></Field>
        </div>
      </section>

      <section className="mt-4 rounded-2xl bg-white p-5">
        <h2 className="font-bold">Payments</h2>
        <p className="text-xs text-muted">Customers pay your own UPI. Staff confirm each payment after hearing the soundbox or checking the bank app.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label="Your UPI ID" hint="A business/merchant UPI ID works best"><input className={`${inputCls} font-mono`} value={v.upiId || ''} onChange={e => setV({ ...v, upiId: e.target.value.trim() })} placeholder="shopname@okaxis" /></Field>
          <Field label="Name shown for UPI"><input className={inputCls} value={v.upiName || ''} onChange={e => setV({ ...v, upiName: e.target.value })} /></Field>
          <Field label="GST on food (%)"><input className={inputCls} inputMode="decimal" value={v.taxBps / 100} onChange={e => setV({ ...v, taxBps: Math.round(Number(e.target.value.replace(/[^\d.]/g, '') || 0) * 100) })} /></Field>
        </div>
        <div className="mt-3 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {v.upiQrUrl && <img src={v.upiQrUrl} alt="Your UPI QR" className="h-16 w-16 rounded-lg border border-line object-cover" />}
          <Btn tone="outline" size="sm" onClick={() => upiQr.current?.click()}><ImagePlus size={15} />{v.upiQrUrl ? 'Change' : 'Upload'} your printed UPI QR</Btn>
          <input ref={upiQr} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={e => e.target.files?.[0] && upload(e.target.files[0], 'upi')} />
        </div>
        <div className="mt-4 divide-y divide-line">
          <Row label="Accept cash at the counter" hint={v.serviceMode === 'seat_delivery' ? 'Cash orders are collected at the counter, not delivered to the seat.' : undefined}><Toggle on={s.acceptCash} onChange={() => set({ acceptCash: !s.acceptCash })} label="Accept cash" /></Row>
          {v.serviceMode === 'table_bill' && <Row label="Staff accept a table’s first QR order" hint="Stops fake orders from a photo of the QR. One tap per table; the next orders go straight to the kitchen."><Toggle on={s.approveFirstOrder !== false} onChange={() => set({ approveFirstOrder: s.approveFirstOrder === false })} label="Accept first order" /></Row>}
          <Row label="Start preparing before payment is confirmed" hint="Only for busy stalls with regular customers. Off is safer."><Toggle on={s.startBeforePayment} onChange={() => set({ startBeforePayment: !s.startBeforePayment })} label="Start before payment" /></Row>
          <Row label="Round bills to the nearest rupee" hint="₹178.50 becomes ₹179, ₹178.40 becomes ₹178. The round-off shows on the bill."><Toggle on={!!s.roundOff} onChange={() => set({ roundOff: !s.roundOff })} label="Round off bills" /></Row>
          <Row label="Cancel unpaid orders after (minutes)"><input className="w-20 rounded-lg border border-line px-2 py-1.5 text-right" inputMode="numeric" value={s.unpaidCancelMin} onChange={e => set({ unpaidCancelMin: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></Row>
        </div>
      </section>

      <section className="mt-4 rounded-2xl bg-white p-5">
        <h2 className="font-bold">Stop orders from outside the venue</h2>
        <div className="mt-2 divide-y divide-line">
          <Row label="Ask customers to scan again after (minutes)" hint="An old link stops working for ordering after this."><input className="w-20 rounded-lg border border-line px-2 py-1.5 text-right" inputMode="numeric" value={s.rescanMinutes} onChange={e => set({ rescanMinutes: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></Row>
          <Row label="A visit lasts at most (hours)"><input className="w-20 rounded-lg border border-line px-2 py-1.5 text-right" inputMode="numeric" value={s.sessionHours} onChange={e => set({ sessionHours: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></Row>
          {v.serviceMode === 'seat_delivery' && <>
            <Row label="Open ordering before a show starts (minutes)"><input className="w-20 rounded-lg border border-line px-2 py-1.5 text-right" inputMode="numeric" value={s.showWindowBeforeMin} onChange={e => set({ showWindowBeforeMin: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></Row>
            <Row label="Stop ordering before the show ends (minutes)" hint="0 = take orders until the end"><input className="w-20 rounded-lg border border-line px-2 py-1.5 text-right" inputMode="numeric" value={s.pauseLastMin} onChange={e => set({ pauseLastMin: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></Row>
          </>}
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 px-4 py-3 backdrop-blur lg:left-[248px]">
        <div className="mx-auto flex max-w-4xl justify-end"><Btn tone="dark" size="lg" loading={busy} onClick={save}>Save settings</Btn></div>
      </div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-semibold">{label}</p>{hint && <p className="text-xs text-muted">{hint}</p>}</div>{children}</div>;
}

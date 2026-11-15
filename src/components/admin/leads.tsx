'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageCircle, Phone, Plus, Rocket, Search, Target, Trash2 } from 'lucide-react';
import { api, timeAgo } from '@/lib/client';
import { Btn, Empty, Field, Pill, Sheet, Spinner, inputCls } from '@/components/ui/kit';
import { useConfirm, useToast } from '@/components/ui/providers';
import { LEAD_STAGES, PageHead, TYPE_LABEL, addDaysISO, day, todayISO } from './common';
import type { Nav } from './super-admin';

type Lead = {
  id: string; business: string; contactName: string; phone: string; email: string; city: string; type: string;
  stage: string; source: string; notes: string; nextFollowUp: string | null; vendorId: string | null; updatedAt: string; createdAt: string;
};
const EMPTY = { business: '', contactName: '', phone: '', email: '', city: '', type: 'restaurant', stage: 'new', source: '', notes: '', nextFollowUp: '' };
const STAGE_TONE: Record<string, 'neutral' | 'info' | 'brand' | 'warn' | 'good' | 'bad'> = { new: 'neutral', contacted: 'info', demo: 'brand', trial: 'warn', won: 'good', lost: 'bad' };

// Sales pipeline: venues we're talking to, what stage they're at, and when to call them next.
export function Leads({ nav }: { nav: Nav }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<(typeof EMPTY & { id?: string }) | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<{ leads: Lead[] }>('/api/admin/leads').then(r => setLeads(r.leads)), []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (leads || [])
      .filter(l => filter === 'all' ? true : filter === 'open' ? !['won', 'lost'].includes(l.stage) : filter === 'due' ? !!l.nextFollowUp && l.nextFollowUp <= todayISO() && !['won', 'lost'].includes(l.stage) : l.stage === filter)
      .filter(l => !t || `${l.business} ${l.contactName} ${l.phone} ${l.city}`.toLowerCase().includes(t))
      .sort((a, b) => (a.nextFollowUp || '9999').localeCompare(b.nextFollowUp || '9999'));
  }, [leads, filter, q]);
  if (!leads) return <div className="grid place-items-center py-24"><Spinner className="text-muted" /></div>;

  const count = (s: string) => leads.filter(l => l.stage === s).length;
  const due = leads.filter(l => l.nextFollowUp && l.nextFollowUp <= todayISO() && !['won', 'lost'].includes(l.stage)).length;
  const won = count('won'), closed = won + count('lost');

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    const payload = { ...edit, nextFollowUp: edit.nextFollowUp || null };
    try {
      if (edit.id) await api(`/api/admin/leads/${edit.id}`, { method: 'PATCH', body: payload });
      else await api('/api/admin/leads', { body: payload });
      toast(edit.id ? 'Lead saved' : 'Lead added'); setEdit(null); load();
    } catch (e) { toast((e as Error).message, 'bad'); } finally { setBusy(false); }
  };
  const quick = async (l: Lead, patch: Partial<Lead>, msg: string) => {
    try { await api(`/api/admin/leads/${l.id}`, { method: 'PATCH', body: patch }); toast(msg); load(); } catch (e) { toast((e as Error).message, 'bad'); }
  };
  const remove = async (l: Lead) => {
    if (!(await confirm({ title: `Delete ${l.business}?`, body: 'The lead and its notes are removed for good. To keep a record, mark it “Lost” instead.', confirm: 'Delete lead', tone: 'danger' }))) return;
    await api(`/api/admin/leads/${l.id}`, { method: 'DELETE' }); toast('Lead deleted'); setEdit(null); load();
  };
  const onboard = (l: Lead) => nav.go('onboard', { prefill: { leadId: l.id, vendorName: l.business, contactName: l.contactName, ownerName: l.contactName, ownerPhone: l.phone.replace(/\D/g, '').slice(-10), email: l.email, city: l.city, type: l.type } });

  return (
    <div>
      <PageHead title="Leads" sub="Venues you’re talking to. Set a follow-up date on each one so nobody is forgotten. When one says yes, onboard them in one click."
        right={<Btn tone="dark" onClick={() => setEdit({ ...EMPTY, nextFollowUp: addDaysISO(1) })}><Plus size={16} />Add lead</Btn>} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Open leads', leads.filter(l => !['won', 'lost'].includes(l.stage)).length], ['Follow-ups due', due], ['On trial', count('trial')], ['Win rate', closed ? `${Math.round((won / closed) * 100)}%` : '—']].map(([l, v]) => (
          <div key={l} className="rounded-2xl bg-white p-4"><p className="text-[13px] font-semibold text-muted">{l}</p><p className="tabular mt-1 text-2xl font-extrabold">{v}</p></div>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {[['open', 'Open'], ['due', `Due today${due ? ` (${due})` : ''}`], ...LEAD_STAGES.map(([k, l]) => [k, `${l} (${count(k)})`]), ['all', 'All']].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-semibold ${filter === k ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-2 hover:bg-soft'}`}>{l}</button>
          ))}
        </div>
        <label className="ml-auto flex min-w-[200px] items-center gap-2 rounded-xl border border-line bg-white px-3 py-2"><Search size={16} className="text-muted" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, phone, city" className="w-full text-sm outline-none" /></label>
      </div>

      {!shown.length ? (
        <div className="rounded-2xl bg-white"><Empty icon={<Target />} title={leads.length ? 'No leads here' : 'No leads yet'}>{leads.length ? 'Try another filter.' : 'Add the theaters, restaurants and cafés you plan to visit or call.'}</Empty></div>
      ) : (
        <div className="space-y-2">
          {shown.map(l => {
            const overdue = l.nextFollowUp && l.nextFollowUp < todayISO() && !['won', 'lost'].includes(l.stage);
            const today = l.nextFollowUp === todayISO();
            const digits = l.phone.replace(/\D/g, '');
            return (
              <div key={l.id} className="rounded-2xl bg-white p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <button onClick={() => setEdit({ ...EMPTY, ...l, nextFollowUp: l.nextFollowUp || '' })} className="min-w-0 flex-1 text-left">
                    <p className="flex flex-wrap items-center gap-2 font-bold">{l.business}<Pill tone={STAGE_TONE[l.stage]}>{LEAD_STAGES.find(s => s[0] === l.stage)?.[1]}</Pill></p>
                    <p className="text-[13px] text-muted">{[TYPE_LABEL[l.type], l.city, l.contactName, l.source && `via ${l.source}`].filter(Boolean).join(' · ')}</p>
                    {l.notes && <p className="mt-1 line-clamp-2 text-sm text-ink-2">{l.notes}</p>}
                  </button>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {digits.length >= 10 && <>
                      <a href={`tel:+91${digits.slice(-10)}`} className="rounded-lg border border-line p-2 text-ink-2 hover:bg-soft" aria-label={`Call ${l.business}`}><Phone size={16} /></a>
                      <a href={`https://wa.me/91${digits.slice(-10)}`} target="_blank" rel="noreferrer" className="rounded-lg border border-line p-2 text-[#128C4B] hover:bg-soft" aria-label={`WhatsApp ${l.business}`}><MessageCircle size={16} /></a>
                    </>}
                    <select aria-label="Stage" value={l.stage} onChange={e => quick(l, { stage: e.target.value }, 'Stage updated')} className="rounded-lg border border-line bg-white px-2 py-1.5 text-[13px] font-semibold">
                      {LEAD_STAGES.map(([k, lab]) => <option key={k} value={k}>{lab}</option>)}
                    </select>
                    {l.vendorId
                      ? <Btn size="sm" tone="outline" onClick={() => nav.go('vendors', { vendor: l.vendorId })}>Open vendor</Btn>
                      : l.stage !== 'lost' && <Btn size="sm" tone="brand" onClick={() => onboard(l)}><Rocket size={14} />Onboard</Btn>}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {!['won', 'lost'].includes(l.stage) && (
                    <label className={`flex items-center gap-1.5 rounded-lg px-2 py-1 font-semibold ${overdue ? 'bg-[#FDECEE] text-[#B42334]' : today ? 'bg-[#FFF3E0] text-[#9A5500]' : 'bg-soft text-ink-2'}`}>
                      Next follow-up
                      <input type="date" value={l.nextFollowUp || ''} onChange={e => quick(l, { nextFollowUp: e.target.value || null }, 'Follow-up date saved')} className="bg-transparent outline-none" />
                    </label>
                  )}
                  <span className="text-muted">Updated {timeAgo(l.updatedAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit lead' : 'Add a lead'} wide
        footer={<div className="flex gap-2">{edit?.id && <Btn tone="danger" onClick={() => leads.find(l => l.id === edit.id) && remove(leads.find(l => l.id === edit.id)!)}><Trash2 size={16} /></Btn>}<Btn tone="dark" className="flex-1" loading={busy} disabled={(edit?.business.trim().length || 0) < 2} onClick={save}>{edit?.id ? 'Save' : 'Add lead'}</Btn></div>}>
        {edit && (
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label="Business name" className="sm:col-span-2"><input autoFocus className={inputCls} value={edit.business} onChange={e => setEdit({ ...edit, business: e.target.value })} placeholder="e.g. Sri Lakshmi Theatre" /></Field>
            <Field label="Type"><select className={inputCls} value={edit.type} onChange={e => setEdit({ ...edit, type: e.target.value })}>{Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Stage"><select className={inputCls} value={edit.stage} onChange={e => setEdit({ ...edit, stage: e.target.value })}>{LEAD_STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Contact person"><input className={inputCls} value={edit.contactName} onChange={e => setEdit({ ...edit, contactName: e.target.value })} /></Field>
            <Field label="Phone"><input className={inputCls} inputMode="tel" value={edit.phone} onChange={e => setEdit({ ...edit, phone: e.target.value })} /></Field>
            <Field label="Email"><input className={inputCls} type="email" value={edit.email} onChange={e => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label="City"><input className={inputCls} value={edit.city} onChange={e => setEdit({ ...edit, city: e.target.value })} /></Field>
            <Field label="How we found them"><input className={inputCls} value={edit.source} onChange={e => setEdit({ ...edit, source: e.target.value })} placeholder="Walk-in, Instagram, referral…" /></Field>
            <Field label="Next follow-up"><input type="date" className={inputCls} value={edit.nextFollowUp} onChange={e => setEdit({ ...edit, nextFollowUp: e.target.value })} /></Field>
            <Field label="Notes" className="sm:col-span-2"><textarea rows={4} className={inputCls} value={edit.notes} onChange={e => setEdit({ ...edit, notes: e.target.value })} placeholder="Seats/tables, who decides, objections, what they liked…" /></Field>
            {edit.id && <p className="text-xs text-muted sm:col-span-2">Added {day(leads.find(l => l.id === edit.id)?.createdAt)}</p>}
          </div>
        )}
      </Sheet>
    </div>
  );
}

'use client';
import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus } from 'lucide-react';
import { api } from '@/lib/client';
import { Btn, Field, Pill, Sheet, Toggle, inputCls } from '@/components/ui/kit';
import { useConfirm, useToast } from '@/components/ui/providers';
import { PageHead } from './shell';
import type { Me, VenueCtx } from './types';

type Member = { id: string; name: string; phone: string; role: string; venueId: string | null; stationId: string | null; active: boolean };
const ROLES = [
  ['manager', 'Manager', 'Everything for one venue except staff logins and settings'],
  ['cashier', 'Cashier / counter', 'Confirms UPI and cash, hands over orders, closes table bills'],
  ['station', 'Kitchen / stall station', 'Sees only its own station’s KOTs, can switch its items off'],
  ['captain', 'Captain / waiter', 'Tables, waiter calls, serves orders, closes bills'],
  ['runner', 'Runner', 'Delivers packed orders to seats'],
] as const;

export function Team({ venue, venues }: { venue: VenueCtx; venues: Me['venues'] }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [list, setList] = useState<Member[]>([]);
  const [stations, setStations] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', phone: '', pin: '', role: 'cashier', venueId: venue.id, stationId: '' });
  const q = `?vendorId=${venue.vendorId}`;
  const load = useCallback(async () => {
    setList((await api<{ team: Member[] }>(`/api/staff/team${q}`)).team);
    setStations((await api<{ stations: { id: string; name: string }[] }>(`/api/staff/v/${venue.id}/menu`)).stations);
  }, [q, venue.id]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (m: Member) => {
    const ok = await confirm({ title: m.active ? `Turn off ${m.name}’s login?` : `Turn ${m.name}’s login back on?`, body: m.active ? 'They are logged out on every device immediately and can’t log in until you turn it back on.' : 'They can log in with their phone number and PIN again.', confirm: m.active ? 'Turn off login' : 'Turn on', tone: m.active ? 'danger' : 'primary' });
    if (!ok) return;
    await api(`/api/staff/team/${m.id}`, { method: 'PATCH', body: { active: !m.active } }); load();
  };
  const reset = async (m: Member) => {
    const r = await confirm({ title: `Set a new PIN for ${m.name}`, body: 'They are logged out everywhere and must use the new PIN.', confirm: 'Set PIN', tone: 'primary', input: { label: 'New 4–6 digit PIN', required: true } });
    if (!r) return;
    try { await api(`/api/staff/team/${m.id}`, { method: 'PATCH', body: { pin: r.value } }); toast(`PIN changed for ${m.name}`); } catch (e) { toast((e as Error).message, 'bad'); }
  };
  const add = async () => {
    const ok = await confirm({ title: `Give ${f.name} a login?`, body: <>They log in at <b>/staff/login</b> with <b>{f.phone}</b> and the PIN you set, as <b>{ROLES.find(r => r[0] === f.role)?.[1]}</b>.</>, confirm: 'Create login', tone: 'primary' });
    if (!ok) return;
    try { await api('/api/staff/team', { body: { ...f, vendorId: venue.vendorId, stationId: f.role === 'station' ? f.stationId : null } }); toast('Login created'); setOpen(false); setF({ ...f, name: '', phone: '', pin: '' }); load(); }
    catch (e) { toast((e as Error).message, 'bad'); }
  };

  return (
    <div>
      <PageHead title="Staff logins" sub="Each person gets their own login, so every confirmed payment and change shows who did it." right={<Btn tone="dark" onClick={() => setOpen(true)}><Plus size={16} />Add staff</Btn>} />
      <div className="overflow-x-auto rounded-2xl bg-white">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="px-4 py-3">Name</th><th className="px-4">Phone</th><th className="px-4">Role</th><th className="px-4">Venue</th><th className="px-4">Login</th><th /></tr></thead>
          <tbody>
            {list.map(m => (
              <tr key={m.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-semibold">{m.name}</td>
                <td className="tabular px-4 font-mono text-ink-2">{m.phone}</td>
                <td className="px-4"><Pill tone={m.role === 'owner' ? 'brand' : 'neutral'}>{m.role === 'owner' ? 'Owner' : ROLES.find(r => r[0] === m.role)?.[1]}</Pill>{m.stationId && <span className="ml-1 text-xs text-muted">{stations.find(s => s.id === m.stationId)?.name}</span>}</td>
                <td className="px-4 text-ink-2">{m.venueId ? venues.find(v => v.id === m.venueId)?.name ?? '—' : 'All venues'}</td>
                <td className="px-4">{m.role !== 'owner' && <Toggle on={m.active} onChange={() => toggle(m)} label={`${m.name} login`} />}</td>
                <td className="px-2">{m.role !== 'owner' && <button onClick={() => reset(m)} className="rounded-lg p-2 text-muted hover:bg-soft" aria-label={`Reset PIN for ${m.name}`}><KeyRound size={16} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Add staff login" footer={<Btn tone="dark" className="w-full" disabled={!f.name || f.phone.length !== 10 || f.pin.length < 4 || (f.role === 'station' && !f.stationId)} onClick={add}>Create login</Btn>}>
        <div className="space-y-3 p-4">
          <Field label="Name"><input className={inputCls} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mobile number"><input className={inputCls} inputMode="numeric" maxLength={10} value={f.phone} onChange={e => setF({ ...f, phone: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="PIN (4–6 digits)"><input className={inputCls} inputMode="numeric" maxLength={6} value={f.pin} onChange={e => setF({ ...f, pin: e.target.value.replace(/\D/g, '') })} /></Field>
          </div>
          {venues.length > 1 && <Field label="Venue"><select className={inputCls} value={f.venueId} onChange={e => setF({ ...f, venueId: e.target.value })}>{venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>}
          <div>
            <p className="mb-1.5 text-[13px] font-semibold text-ink-2">Role</p>
            <div className="space-y-2">
              {ROLES.map(([k, l, d]) => (
                <button key={k} type="button" onClick={() => setF({ ...f, role: k })} className={`block w-full rounded-xl border p-3 text-left ${f.role === k ? 'border-ink bg-soft' : 'border-line'}`}><b className="text-sm">{l}</b><p className="text-xs text-muted">{d}</p></button>
              ))}
            </div>
          </div>
          {f.role === 'station' && <Field label="Station"><select className={inputCls} value={f.stationId} onChange={e => setF({ ...f, stationId: e.target.value })}><option value="">Choose station</option>{stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        </div>
      </Sheet>
    </div>
  );
}

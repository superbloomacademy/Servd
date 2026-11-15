'use client';
import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api, rupee } from '@/lib/client';
import { Btn, Empty, Field, Sheet, Toggle, inputCls } from '@/components/ui/kit';
import { useConfirm, useToast } from '@/components/ui/providers';
import { PageHead } from './shell';
import type { VenueCtx } from './types';

type Coupon = { id: string; code: string; type: 'percent' | 'flat'; value: number; maxDiscountPaise: number; minOrderPaise: number; usageLimit: number; perCustomer: number; used: number; description: string; expiresAt: string | null; active: boolean };

export function Coupons({ venue }: { venue: VenueCtx }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [list, setList] = useState<Coupon[] | null>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ code: '', type: 'percent', value: '', max: '', min: '', limit: '', per: '1', expires: '', description: '' });
  const q = `?vendorId=${venue.vendorId}`;
  const load = useCallback(async () => setList((await api<{ coupons: Coupon[] }>(`/api/staff/coupons${q}`)).coupons), [q]);
  useEffect(() => { load(); }, [load]);

  const offer = (c: Coupon) => c.type === 'percent' ? `${c.value}% off${c.maxDiscountPaise ? `, up to ${rupee(c.maxDiscountPaise)}` : ''}` : `${rupee(c.value)} off`;
  const toggle = async (c: Coupon) => {
    const ok = await confirm({ title: c.active ? `Turn off ${c.code}?` : `Turn ${c.code} back on?`, body: c.active ? 'Customers can no longer apply it. Orders that already used it are not affected.' : 'Customers can apply it again.', confirm: c.active ? 'Turn off' : 'Turn on', tone: c.active ? 'danger' : 'primary' });
    if (!ok) return;
    await api(`/api/staff/coupons/${c.id}`, { method: 'PATCH', body: { active: !c.active } }); load();
  };
  const del = async (c: Coupon) => {
    if (!(await confirm({ title: `Delete ${c.code}?`, body: 'This can’t be undone. To pause it, turn it off instead.', confirm: 'Delete', tone: 'danger' }))) return;
    await api(`/api/staff/coupons/${c.id}`, { method: 'DELETE' }); toast('Coupon deleted'); load();
  };
  const create = async () => {
    const body = {
      vendorId: venue.vendorId, code: f.code, type: f.type, description: f.description,
      value: f.type === 'flat' ? Math.round(Number(f.value) * 100) : Number(f.value),
      maxDiscountPaise: Math.round(Number(f.max || 0) * 100), minOrderPaise: Math.round(Number(f.min || 0) * 100),
      usageLimit: Number(f.limit || 0), perCustomer: Number(f.per || 0), expiresAt: f.expires || null,
    };
    const ok = await confirm({ title: `Create ${f.code.toUpperCase()}?`, body: `${f.type === 'flat' ? `₹${f.value} off` : `${f.value}% off`}${f.min ? ` on orders above ₹${f.min}` : ''}. Customers can use it immediately.`, confirm: 'Create coupon', tone: 'primary' });
    if (!ok) return;
    try { await api('/api/staff/coupons', { body }); toast('Coupon created'); setOpen(false); setF({ code: '', type: 'percent', value: '', max: '', min: '', limit: '', per: '1', expires: '', description: '' }); load(); }
    catch (e) { toast((e as Error).message, 'bad'); }
  };

  return (
    <div>
      <PageHead title="Coupons" sub="Coupons apply at every venue of your business. The cart suggests the best one automatically, with “add ₹X more to unlock” hints." right={<Btn tone="dark" onClick={() => setOpen(true)}><Plus size={16} />Create coupon</Btn>} />
      <div className="overflow-x-auto rounded-2xl bg-white">
        {list && !list.length ? <Empty title="No coupons yet">Create one to bring customers back.</Empty> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="px-4 py-3">Code</th><th className="px-4">Offer</th><th className="px-4 text-right">Min order</th><th className="px-4 text-right">Used</th><th className="px-4">Expires</th><th className="px-4">Active</th><th /></tr></thead>
            <tbody>
              {(list || []).map(c => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-mono font-bold">{c.code}</td>
                  <td className="px-4">{offer(c)}<p className="text-xs text-muted">{c.description}{c.perCustomer ? ` · ${c.perCustomer} per customer` : ''}</p></td>
                  <td className="tabular px-4 text-right">{c.minOrderPaise ? rupee(c.minOrderPaise) : '—'}</td>
                  <td className="tabular px-4 text-right">{c.used}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
                  <td className="px-4">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Never'}</td>
                  <td className="px-4"><Toggle on={c.active} onChange={() => toggle(c)} label={`${c.code} active`} /></td>
                  <td className="px-2"><button onClick={() => del(c)} className="rounded-lg p-2 text-muted hover:bg-soft hover:text-bad" aria-label={`Delete ${c.code}`}><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Create coupon" footer={<Btn tone="dark" className="w-full" disabled={!f.code || !f.value} onClick={create}>Create coupon</Btn>}>
        <div className="grid grid-cols-2 gap-3 p-4">
          <Field label="Code"><input className={`${inputCls} font-mono uppercase`} value={f.code} onChange={e => setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} placeholder="POPCORN20" /></Field>
          <Field label="Type"><select className={inputCls} value={f.type} onChange={e => setF({ ...f, type: e.target.value })}><option value="percent">% off</option><option value="flat">₹ off</option></select></Field>
          <Field label={f.type === 'flat' ? 'Amount off (₹)' : 'Percent off'}><input className={inputCls} inputMode="numeric" value={f.value} onChange={e => setF({ ...f, value: e.target.value.replace(/\D/g, '') })} /></Field>
          {f.type === 'percent' ? <Field label="Max discount (₹)" hint="Empty = no cap"><input className={inputCls} inputMode="numeric" value={f.max} onChange={e => setF({ ...f, max: e.target.value.replace(/\D/g, '') })} /></Field> : <div />}
          <Field label="Minimum order (₹)"><input className={inputCls} inputMode="numeric" value={f.min} onChange={e => setF({ ...f, min: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label="Uses per customer" hint="0 = unlimited"><input className={inputCls} inputMode="numeric" value={f.per} onChange={e => setF({ ...f, per: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label="Total uses allowed" hint="Empty = unlimited"><input className={inputCls} inputMode="numeric" value={f.limit} onChange={e => setF({ ...f, limit: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label="Expires on"><input className={inputCls} type="date" value={f.expires} onChange={e => setF({ ...f, expires: e.target.value })} /></Field>
          <Field label="What customers see" className="col-span-2"><input className={inputCls} value={f.description} maxLength={120} onChange={e => setF({ ...f, description: e.target.value })} placeholder="20% off popcorn this weekend" /></Field>
        </div>
      </Sheet>
    </div>
  );
}

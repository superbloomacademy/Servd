'use client';
import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Presentation, RefreshCw, Trash2 } from 'lucide-react';
import { api, timeAgo } from '@/lib/client';
import { Btn, Empty, Field, Spinner, inputCls } from '@/components/ui/kit';
import { useConfirm, useToast } from '@/components/ui/providers';
import { ROLE_LABEL } from '@/lib/roles';
import { Card, DemoBadge, Logo, MODE_LABEL, PageHead, TYPE_LABEL } from './common';
import type { Nav } from './super-admin';

type DemoVenue = { id: string; name: string; type: string; serviceMode: string; spotLabel: string | null; code: string | null; orders: number; lastOrderAt: string | null; qr: { url: string; png: string } | null };
type DemoVendor = { id: string; name: string; brandColor: string; createdAt: string; venues: DemoVenue[]; logins: { name: string; phone: string; role: keyof typeof ROLE_LABEL }[] };

// Demo venues for pitches: sample theater, restaurant, café and stall with two weeks of orders.
// Marked "Demo" everywhere, left out of platform totals, never billed. Refresh before each pitch.
export function DemoAdmin({ nav }: { nav: Nav }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<DemoVendor[] | null>(null);
  const [local, setLocal] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => api<{ vendors: DemoVendor[]; localDemoMode: boolean }>('/api/admin/demo').then(r => { setList(r.vendors); setLocal(r.localDemoMode); }), []);
  useEffect(() => { load(); }, [load]);

  const pinOk = local ? /^\d{4,6}$/.test(pin) : /^\d{6}$/.test(pin);
  const run = async (action: 'create' | 'refresh' | 'remove') => {
    const ok = await confirm(action === 'remove'
      ? { title: 'Remove all demo data?', body: 'The four demo vendors, their menus, logins and sample orders are deleted. Your real vendors are not touched.', confirm: 'Remove demo data', tone: 'danger' }
      : action === 'refresh'
        ? { title: 'Refresh the demo?', body: <>Everything in the demo is deleted and made fresh: two weeks of sample orders up to today, and any orders placed during pitches are cleared. Demo logins get the PIN <b>{pin}</b>. QR codes change, so print or scan the new ones. Takes up to a minute.</>, confirm: 'Refresh demo', tone: 'primary' }
        : { title: 'Create the demo venues?', body: <>Adds a sample theater, restaurant, café and food stall with menus, staff logins and two weeks of orders. All demo logins use the PIN <b>{pin}</b>. Takes up to a minute.</>, confirm: 'Create demo', tone: 'primary' });
    if (!ok) return;
    setBusy(action);
    try { const r = await api<{ vendors: DemoVendor[] }>('/api/admin/demo', { body: { action, pin } }); setList(r.vendors); toast(action === 'remove' ? 'Demo data removed' : 'Demo is ready'); }
    catch (e) { toast((e as Error).message, 'bad'); } finally { setBusy(null); }
  };

  if (!list) return <div className="grid place-items-center py-24"><Spinner className="text-muted" /></div>;
  const pinField = (
    <Field label="PIN for all demo logins" hint={local ? '4–6 digits (this PC).' : '6 digits, not easy to guess. Write it down: you need it to log in as a demo owner or cashier during a pitch.'}>
      <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder={local ? 'e.g. 1234' : '6 digits'} className={`${inputCls} tabular max-w-48 tracking-widest`} />
    </Field>
  );

  return (
    <div>
      <PageHead title="Demo for pitches" sub="Sample venues that look and work like real ones, to show Servd to a venue owner. They are marked Demo everywhere, are not counted in your numbers and are never billed." />
      {!list.length ? (
        <Card>
          <Empty icon={<Presentation />} title="No demo venues yet">Create a sample theater, restaurant, café and food stall, each with a menu, tables or seats, staff logins and two weeks of orders.</Empty>
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 pb-4">{pinField}<Btn tone="dark" size="lg" disabled={!pinOk} loading={busy === 'create'} onClick={() => run('create')}>Create demo venues</Btn></div>
        </Card>
      ) : (
        <>
          <Card title="Before a pitch" right={<span className="text-xs text-muted">Last made {timeAgo(list[0].createdAt)}</span>}>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-2">
              <li><b>Refresh</b> the demo so the sample orders run up to today and old pitch orders are cleared.</li>
              <li>Hand the owner your phone: scan the venue’s QR below and order like a guest.</li>
              <li>On your laptop, log in as that venue’s owner or cashier (numbers below, demo PIN) and show the order arriving, the kitchen ticket, billing and reports.</li>
            </ol>
            <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
              {pinField}
              <Btn tone="dark" disabled={!pinOk} loading={busy === 'refresh'} onClick={() => run('refresh')}><RefreshCw size={15} />Refresh demo</Btn>
              <Btn tone="danger" loading={busy === 'remove'} onClick={() => run('remove')}><Trash2 size={15} />Remove demo</Btn>
            </div>
          </Card>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {list.map(v => (
              <Card key={v.id}>
                <div className="flex items-center gap-3">
                  <Logo name={v.name} color={v.brandColor} size={40} />
                  <div className="min-w-0 flex-1"><p className="flex items-center gap-2 font-bold">{v.name}<DemoBadge /></p>
                    <p className="text-xs text-muted">{v.venues.map(x => `${TYPE_LABEL[x.type]} · ${MODE_LABEL[x.serviceMode]}`).join(' · ')}</p></div>
                  <Btn size="sm" tone="outline" onClick={() => nav.go('vendors', { vendor: v.id })}>Details</Btn>
                </div>
                {v.venues.map(x => (
                  <div key={x.id} className="mt-4 flex gap-4">
                    {x.qr && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={x.qr.png} alt={`QR for ${x.name}`} className="h-32 w-32 shrink-0 rounded-lg border border-line" />
                    )}
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-semibold">{x.name}</p>
                      <p className="text-xs text-muted">{x.spotLabel ? `QR for ${x.type === 'theater' ? 'seat' : x.serviceMode === 'shop_qr' ? '' : 'table'} ${x.spotLabel}`.replace('  ', ' ') : 'No QR codes'} · {x.orders} orders{x.lastOrderAt ? `, last ${timeAgo(x.lastOrderAt)}` : ''}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {x.qr && <a href={x.qr.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[13px] font-semibold hover:bg-soft">Guest menu<ExternalLink size={13} /></a>}
                        <Btn size="sm" tone="outline" onClick={() => nav.openVenue(x.id)}>Staff screens<ExternalLink size={13} /></Btn>
                        <a href={`/print/qr/${x.id}`} target="_blank" rel="noopener" className="inline-flex items-center rounded-lg border border-line px-2.5 py-1.5 text-[13px] font-semibold hover:bg-soft">All QR codes</a>
                      </div>
                    </div>
                  </div>
                ))}
                <details className="mt-4 rounded-xl bg-soft px-3 py-2 text-sm">
                  <summary className="cursor-pointer font-semibold">Demo logins ({v.logins.length})</summary>
                  <ul className="mt-2 divide-y divide-line">
                    {v.logins.map(l => <li key={l.phone} className="flex justify-between gap-3 py-1.5"><span>{ROLE_LABEL[l.role]}<span className="text-muted"> · {l.name}</span></span><span className="tabular font-semibold">{l.phone}</span></li>)}
                  </ul>
                  <p className="mt-1 text-xs text-muted">PIN: the one you chose when you last created or refreshed the demo.</p>
                </details>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

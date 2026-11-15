'use client';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '@/lib/client';
import { Btn, Empty, inputCls } from '@/components/ui/kit';
import { useToast } from '@/components/ui/providers';
import { OrderButtons, OrderCard, useOrderActions } from './order-parts';
import { PageHead } from './shell';
import type { Live, Order, Role, VenueCtx } from './types';

const CAN: Record<string, Role[]> = {
  pay: ['owner', 'manager', 'cashier', 'captain'], cook: ['owner', 'manager', 'cashier', 'station'],
  deliver: ['owner', 'manager', 'cashier', 'captain', 'runner'], reject: ['owner', 'manager', 'cashier'],
};

// Orders & payments: confirm UPI/cash, follow every order, find an order by KOT number.
export function LiveBoard({ venue, live, role, flash, reload }: { venue: VenueCtx; live: Live; role: Role; flash: Set<string>; reload: () => void }) {
  const toast = useToast();
  const actions = useOrderActions(reload);
  const can = (a: 'pay' | 'cook' | 'deliver' | 'reject') => CAN[a].includes(role);
  const [kotQ, setKotQ] = useState('');
  const [found, setFound] = useState<Order | null>(null);
  const [mobileCol, setMobileCol] = useState(0);
  const seat = venue.serviceMode === 'seat_delivery';

  const cols = useMemo(() => {
    const by = (f: (o: Order) => boolean) => live.orders.filter(f);
    const c = [
      { key: 'pay', title: 'Payment to confirm', hint: 'Check soundbox / bank, then confirm', list: by(o => o.status === 'awaiting_payment').sort((a, b) => Number(b.payStatus === 'claimed') - Number(a.payStatus === 'claimed') || +new Date(a.createdAt) - +new Date(b.createdAt)) },
      { key: 'kitchen', title: 'In the kitchen', hint: 'Confirmed and being prepared', list: by(o => ['confirmed', 'preparing'].includes(o.status)).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)) },
      { key: 'ready', title: seat ? 'Ready to deliver' : 'Ready', hint: seat ? 'Runner picks up' : 'Hand over / serve', list: by(o => o.status === 'ready') },
      ...(seat ? [{ key: 'out', title: 'On the way', hint: 'Walking to the seat', list: by(o => o.status === 'out') }] : []),
      { key: 'done', title: 'Done today', hint: 'Last 12 hours', list: by(o => ['delivered', 'cancelled', 'rejected'].includes(o.status)).slice(0, 25) },
    ];
    return c;
  }, [live.orders, seat]);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kotQ.trim()) return;
    try { setFound((await api<{ order: Order }>(`/api/staff/v/${venue.id}/kot/${kotQ.trim()}`)).order); }
    catch (err) { setFound(null); toast((err as Error).message, 'bad'); }
  };
  const foundLive = found ? live.orders.find(o => o.id === found.id) || found : null;

  return (
    <div>
      <PageHead title="Orders & payments" sub="New orders and payment claims appear here instantly, with a sound. Confirm a payment only after you hear the soundbox or see it in your bank app."
        right={
          <form onSubmit={lookup} className="flex items-center gap-2">
            <label className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 focus-within:border-ink">
              <Search size={16} className="text-muted" />
              <input value={kotQ} onChange={e => setKotQ(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Enter KOT no." aria-label="KOT number" className="w-32 py-2.5 text-[15px] font-semibold outline-none" />
            </label>
            <Btn tone="dark">Find</Btn>
          </form>
        } />

      {foundLive && (
        <div className="mb-5 max-w-md">
          <div className="mb-2 flex items-center justify-between"><h2 className="font-bold">KOT {foundLive.kotNo}</h2><button onClick={() => { setFound(null); setKotQ(''); }} className="text-sm font-semibold text-muted">Close</button></div>
          <OrderCard o={foundLive} flash><OrderButtons o={foundLive} actions={actions} can={can} /></OrderCard>
        </div>
      )}

      <div className="no-scrollbar mb-3 flex gap-1 overflow-x-auto xl:hidden" role="tablist">
        {cols.map((c, i) => (
          <button key={c.key} role="tab" aria-selected={mobileCol === i} onClick={() => setMobileCol(i)}
            className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold ${mobileCol === i ? 'bg-ink text-white' : 'bg-white text-ink-2'}`}>{c.title} <span className="tabular opacity-70">{c.list.length}</span></button>
        ))}
      </div>
      <div className={`grid gap-4 ${seat ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>
        {cols.map((c, i) => (
          <section key={c.key} className={`${mobileCol === i ? '' : 'hidden'} min-w-0 xl:block`}>
            <div className="mb-2 hidden items-baseline justify-between xl:flex"><h2 className="font-bold">{c.title}</h2><span className="tabular text-sm text-muted">{c.list.length}</span></div>
            <p className="mb-2 hidden text-xs text-muted xl:block">{c.hint}</p>
            <div className="space-y-3">
              {c.list.map(o => (
                <OrderCard key={o.id} o={o} flash={flash.has(o.id)}>
                  {c.key === 'done' ? <span className={`text-xs font-semibold ${o.status === 'delivered' ? 'text-good' : 'text-bad'}`}>{o.status === 'delivered' ? (o.fulfilment === 'pickup' ? 'Handed over' : 'Delivered') : o.status === 'cancelled' ? `Cancelled${o.rejectReason ? ' · ' + o.rejectReason : ''}` : `Rejected · ${o.rejectReason}`}</span>
                    : <OrderButtons o={o} actions={actions} can={can} />}
                </OrderCard>
              ))}
              {!c.list.length && <div className="rounded-2xl border border-dashed border-line bg-white/60"><Empty title="Nothing here" /></div>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

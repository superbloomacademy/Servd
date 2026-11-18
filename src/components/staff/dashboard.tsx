'use client';
import { useEffect, useState } from 'react';
import { Banknote, Smartphone, TrendingDown } from 'lucide-react';
import { api, rupee, rupeeShort } from '@/lib/client';
import { Spinner } from '@/components/ui/kit';
import { PageHead } from './shell';
import type { VenueCtx } from './types';

type Stats = {
  orders: number; revenue: number; discount: number; tax: number; customers: number; aov: number; repeatCustomers: number; liveOrders: number;
  byMethod: { method: string | null; orders: number; amount: number }[];
  topItems: { name: string; qty: number; revenue: number }[];
  byHour: { h: number; orders: number; revenue: number }[];
  byDay: { day: string; orders: number; revenue: number }[];
  prep: { station: string; avgMin: number; n: number }[];
  settlement: { commissionBps: number; commissionPaise: number; qrSalesPaise: number; tablesClosed: number };
};
const RANGES = [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['all', 'All time']] as const;

export function Dashboard({ venue }: { venue: VenueCtx }) {
  const [range, setRange] = useState<string>('7d');
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => { setS(null); api<Stats>(`/api/staff/v/${venue.id}/stats?range=${range}`).then(setS).catch(() => {}); }, [venue.id, range]);

  const upi = s?.byMethod.find(m => m.method === 'upi_shop') ?? { orders: 0, amount: 0 };
  const cash = s?.byMethod.find(m => m.method === 'cash') ?? { orders: 0, amount: 0 };
  const maxItem = Math.max(1, ...(s?.topItems.slice(0, 8).map(t => t.qty) || [1]));
  const hours = s ? Array.from({ length: 24 }, (_, h) => s.byHour.find(x => x.h === h) || { h, orders: 0, revenue: 0 }).filter(x => x.orders || (x.h >= 9 && x.h <= 23)) : [];

  return (
    <div>
      <PageHead title="Dashboard" sub={`${venue.name} · paid orders only`}
        right={<div className="flex rounded-xl bg-white p-1">{RANGES.map(([k, l]) => <button key={k} onClick={() => setRange(k)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${range === k ? 'bg-ink text-white' : 'text-muted'}`}>{l}</button>)}</div>} />
      {!s ? <div className="grid place-items-center py-24"><Spinner className="text-muted" /></div> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi label="Sales" value={rupee(s.revenue)} sub={s.discount ? `after ${rupee(s.discount)} coupons` : 'incl. GST'} big />
            <Kpi label="Orders" value={String(s.orders)} sub={`${s.liveOrders} in progress now`} />
            <Kpi label="Average order" value={rupee(s.aov)} sub={`GST collected ${rupeeShort(s.tax)}`} />
            <Kpi label="Customers" value={String(s.customers)} sub={`${s.repeatCustomers} came back again`} />
            <Kpi label="Avg. kitchen time" value={s.prep.length ? `${(s.prep.reduce((a, p) => a + p.avgMin * p.n, 0) / Math.max(1, s.prep.reduce((a, p) => a + p.n, 0))).toFixed(1)} min` : '—'} sub="order to ready" />
          </div>

          <section className="mt-4 rounded-2xl bg-white p-5">
            <h2 className="font-bold">Online vs cash · settlement</h2>
            <p className="text-xs text-muted">Testing phase: every payment goes straight to your own UPI or cash drawer. Platform commission is {s.settlement.commissionBps / 100}% of orders guests place by QR. Orders you bill at the counter carry no commission.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Money icon={<Smartphone size={18} />} label="UPI to your account" amount={upi.amount} n={upi.orders} total={s.revenue} color="var(--brand)" />
              <Money icon={<Banknote size={18} />} label="Cash at counter" amount={cash.amount} n={cash.orders} total={s.revenue} color="#1BA672" />
              <div className="rounded-xl bg-soft p-4">
                <p className="text-sm font-semibold text-ink-2">Platform commission due</p>
                <p className="tabular mt-1 text-2xl font-extrabold">{rupee(s.settlement.commissionPaise)}</p>
                <p className="text-xs text-muted">{s.settlement.commissionBps / 100}% of {rupee(s.settlement.qrSalesPaise)} QR orders{s.settlement.tablesClosed ? ` · ${s.settlement.tablesClosed} table bills closed` : ''}</p>
              </div>
            </div>
            <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-soft">
              <div style={{ width: `${(upi.amount / Math.max(1, s.revenue)) * 100}%`, background: 'var(--brand)' }} /><div style={{ width: `${(cash.amount / Math.max(1, s.revenue)) * 100}%`, background: '#1BA672' }} />
            </div>
          </section>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <div className="space-y-4">
              {s.byDay.length > 1 && <section className="rounded-2xl bg-white p-5"><h2 className="font-bold">Sales by day</h2><Bars data={s.byDay.map(d => ({ label: new Date(d.day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), value: d.revenue, sub: `${d.orders} orders` }))} money /></section>}
              <section className="rounded-2xl bg-white p-5"><h2 className="font-bold">Orders by hour <span className="font-normal text-muted">· plan staff for the peaks</span></h2>
                <Bars data={hours.map(h => ({ label: `${h.h % 12 || 12}${h.h < 12 ? 'a' : 'p'}`, value: h.orders, sub: rupee(h.revenue) }))} /></section>
              <section className="rounded-2xl bg-white p-5"><h2 className="font-bold">Kitchen speed by station</h2>
                <ul className="mt-3 divide-y divide-line text-sm">{s.prep.map(p => <li key={p.station} className="flex justify-between py-2"><span>{p.station}</span><span className="tabular text-muted">{p.avgMin} min avg · {p.n} KOTs</span></li>)}{!s.prep.length && <li className="py-2 text-muted">No KOTs yet.</li>}</ul></section>
            </div>
            <div className="space-y-4">
              <section className="rounded-2xl bg-white p-5">
                <h2 className="font-bold">Best sellers</h2>
                <ul className="mt-3 space-y-3">
                  {s.topItems.slice(0, 8).map((t, i) => (
                    <li key={t.name}>
                      <div className="flex justify-between gap-2 text-sm"><span className="truncate font-semibold">{t.name}</span><span className="tabular shrink-0 text-muted">{t.qty} · {rupeeShort(t.revenue)}</span></div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-soft"><div className="h-full rounded-full" style={{ width: `${(t.qty / maxItem) * 100}%`, background: i === 0 ? 'var(--brand)' : '#3D4152' }} /></div>
                    </li>
                  ))}
                  {!s.topItems.length && <li className="text-sm text-muted">No sales in this period.</li>}
                </ul>
              </section>
              {s.topItems.length > 6 && (
                <section className="rounded-2xl bg-white p-5">
                  <h2 className="flex items-center gap-2 font-bold"><TrendingDown size={17} className="text-warn" />Slow movers</h2>
                  <p className="text-xs text-muted">Try a combo, a better photo, or a coupon.</p>
                  <ul className="mt-3 divide-y divide-line text-sm">{s.topItems.slice(-4).reverse().map(t => <li key={t.name} className="flex justify-between py-2"><span>{t.name}</span><span className="tabular text-muted">{t.qty} sold</span></li>)}</ul>
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, big }: { label: string; value: string; sub: string; big?: boolean }) {
  return <div className={`rounded-2xl bg-white p-4 ${big ? 'ring-2 ring-brand-line' : ''}`}><p className="text-[13px] font-semibold text-muted">{label}</p><p className="tabular mt-1 text-2xl font-extrabold">{value}</p><p className="mt-0.5 text-xs text-muted">{sub}</p></div>;
}
function Money({ icon, label, amount, n, total, color }: { icon: React.ReactNode; label: string; amount: number; n: number; total: number; color: string }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink-2"><span style={{ color }}>{icon}</span>{label}</p>
      <p className="tabular mt-1 text-2xl font-extrabold">{rupee(amount)}</p>
      <p className="text-xs text-muted">{n} orders · {total ? Math.round((amount / total) * 100) : 0}%</p>
    </div>
  );
}

// Simple bar chart drawn to scale with labelled gridlines.
export function Bars({ data, money }: { data: { label: string; value: number; sub?: string }[]; money?: boolean }) {
  if (!data.length) return <p className="mt-3 text-sm text-muted">No data.</p>;
  const W = 640, H = 190, L = 44, B = 22, T = 10;
  const max = Math.max(1, ...data.map(d => d.value));
  const raw = max / 4, p = 10 ** Math.floor(Math.log10(raw)), step = (raw / p <= 1 ? 1 : raw / p <= 2 ? 2 : raw / p <= 5 ? 5 : 10) * p;
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const bw = (W - L) / data.length;
  const ticks: number[] = []; for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  const every = Math.ceil(data.length / 14);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-auto w-full" role="img">
      {ticks.map(v => <g key={v}><line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={L - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--muted)">{money ? rupeeShort(v) : v}</text></g>)}
      {data.map((d, i) => {
        const x = L + i * bw + bw * 0.2, w = bw * 0.6;
        return (
          <g key={i}>
            <rect x={x} y={y(d.value)} width={w} height={Math.max(0, H - B - y(d.value))} rx={3} fill="var(--brand)"><title>{`${d.label}: ${money ? rupee(d.value) : d.value}${d.sub ? ' · ' + d.sub : ''}`}</title></rect>
            {i % every === 0 && <text x={x + w / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">{d.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

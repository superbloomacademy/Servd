'use client';
import { useEffect, useState } from 'react';
import { AlertCircle, CalendarClock, ChevronRight, Hourglass, MessageCircleWarning, MoonStar, QrCode, Wrench } from 'lucide-react';
import { api, rupee, rupeeShort, timeAgo } from '@/lib/client';
import { Spinner } from '@/components/ui/kit';
import { Bars } from '@/components/staff/dashboard';
import { Card, Kpi, LEAD_STAGES, PageHead, day, todayISO } from './common';
import type { Nav } from './super-admin';

type Sum = { orders: number; sales: number };
type Data = {
  kpi: {
    today: Sum; week: Sum; month: Sum; venues: number; customers: number; newCustomers: number; monthDue: number;
    vendors: { total: number; live: number; setup: number; suspended: number }; unpaidEarlier: { n: number; total: number };
  };
  days: { day: string; sales: number; orders: number }[];
  sources: { qr: Sum; counter: Sum; apps: Sum };
  top: { venueId: string; venue: string; vendor: string; vendorId: string; sales: number; orders: number }[];
  attention: {
    followUps: { id: string; business: string; stage: string; nextFollowUp: string; phone: string }[];
    setup: { id: string; name: string; since: string }[];
    quiet: { venueId: string; venue: string; vendor: string; vendorId: string }[];
    tickets: { id: string; topic: string; venue: string; createdAt: string }[];
    trialsEnding: { id: string; name: string; trialEndsAt: string }[];
    suspended: { id: string; name: string }[];
    lowQr: { venueId: string; venue: string; vendor: string; vendorId: string; share: number; orders: number }[];
  };
};

export function Overview({ nav }: { nav: Nav }) {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => { api<Data>('/api/admin/overview').then(setD); }, []);
  if (!d) return <div className="grid place-items-center py-24"><Spinner className="text-muted" /></div>;
  const { kpi, attention: a } = d;
  const items = a.followUps.length + a.setup.length + a.quiet.length + a.tickets.length + a.trialsEnding.length + a.lowQr.length + (kpi.unpaidEarlier.n ? 1 : 0);
  const stageLabel = (s: string) => LEAD_STAGES.find(x => x[0] === s)?.[1] ?? s;

  return (
    <div>
      <PageHead title="Overview" sub="All venues on the platform. Sales are paid orders only, from guest QR and from staff billing." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Sales today" value={rupee(kpi.today.sales)} sub={`${kpi.today.orders} orders`} />
        <Kpi label="Last 7 days" value={rupeeShort(kpi.week.sales)} sub={`${kpi.week.orders} orders`} />
        <Kpi label="Last 30 days" value={rupeeShort(kpi.month.sales)} sub={`${kpi.month.orders} orders · avg ${rupee(Math.round(kpi.month.sales / Math.max(1, kpi.month.orders)))}`} />
        <Kpi label="Our earnings this month" value={rupee(kpi.monthDue)} sub={<button className="font-semibold text-brand-text" onClick={() => nav.go('billing')}>Commission + fees →</button>} tone="brand" />
        <Kpi label="Vendors" value={String(kpi.vendors.total)} sub={`${kpi.vendors.live} live · ${kpi.vendors.setup} setting up${kpi.vendors.suspended ? ` · ${kpi.vendors.suspended} suspended` : ''}`} />
        <Kpi label="Venues" value={String(kpi.venues)} sub="branches across vendors" />
        <Kpi label="Customers" value={String(kpi.customers)} sub={`${kpi.newCustomers} new in 30 days`} />
        <Kpi label="Unpaid from earlier months" value={rupee(kpi.unpaidEarlier.total)} sub={kpi.unpaidEarlier.n ? `${kpi.unpaidEarlier.n} bills` : 'All settled'} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Card title="Sales, last 14 days">
            <Bars money data={d.days.map(x => ({ label: new Date(`${x.day}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), value: x.sales, sub: `${x.orders} orders` }))} />
          </Card>
          <Card title="Where orders come from · 30 days" right={<span className="text-xs text-muted">Commission is earned on guest QR orders</span>}>
            <Sources s={d.sources} />
          </Card>
          <Card title="Top venues · 30 days">
            <ul className="divide-y divide-line text-sm">
              {d.top.map((t, i) => (
                <li key={t.venueId}>
                  <button onClick={() => nav.go('vendors', { vendor: t.vendorId })} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-soft">
                    <span className="tabular w-5 text-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{t.venue}</span><span className="block truncate text-xs text-muted">{t.vendor}</span></span>
                    <span className="tabular text-right"><span className="block font-bold">{rupee(t.sales)}</span><span className="block text-xs text-muted">{t.orders} orders</span></span>
                  </button>
                </li>
              ))}
              {!d.top.length && <li className="py-3 text-muted">No sales in the last 30 days.</li>}
            </ul>
          </Card>
        </div>

        <Card title={<>Needs your attention {items > 0 && <span className="ml-1 rounded-full bg-bad px-2 py-0.5 text-xs text-white">{items}</span>}</>}>
          {items === 0 && <p className="py-6 text-center text-sm text-muted">Nothing needs you right now.</p>}
          <ul className="space-y-1">
            {a.followUps.map(l => (
              <Row key={l.id} icon={<CalendarClock size={17} />} tone="info" onClick={() => nav.go('leads')}
                title={`Follow up: ${l.business}`} sub={`${stageLabel(l.stage)} · ${l.nextFollowUp < todayISO() ? 'overdue since ' : 'due '}${day(l.nextFollowUp)}${l.phone ? ` · ${l.phone}` : ''}`} />
            ))}
            {a.setup.map(v => (
              <Row key={v.id} icon={<Wrench size={17} />} tone="warn" onClick={() => nav.go('vendors', { vendor: v.id })}
                title={`${v.name} is still setting up`} sub={`Onboarded ${timeAgo(v.since)}. Help them finish the checklist.`} />
            ))}
            {a.trialsEnding.map(v => (
              <Row key={v.id} icon={<Hourglass size={17} />} tone="warn" onClick={() => nav.go('vendors', { vendor: v.id })}
                title={`${v.name}: free trial ends ${day(v.trialEndsAt)}`} sub="Call them about the plan before it ends." />
            ))}
            {a.tickets.map(t => (
              <Row key={t.id} icon={<MessageCircleWarning size={17} />} tone="bad" onClick={() => nav.go('support')}
                title={`No reply for 24 h+: ${t.topic}`} sub={`${t.venue} · ${timeAgo(t.createdAt)}`} />
            ))}
            {a.quiet.map(v => (
              <Row key={v.venueId} icon={<MoonStar size={17} />} tone="neutral" onClick={() => nav.go('vendors', { vendor: v.vendorId })}
                title={`No orders in 7 days: ${v.venue}`} sub={`${v.vendor}. Check if they need help or new QR stickers.`} />
            ))}
            {a.lowQr.map(v => (
              <Row key={v.venueId} icon={<QrCode size={17} />} tone="warn" onClick={() => nav.go('vendors', { vendor: v.vendorId })}
                title={`Few guest QR orders: ${v.venue}`} sub={`Only ${v.share}% of ${v.orders} orders in 30 days came by QR (${v.vendor}). Check the stickers are on every table and staff tell guests to scan.`} />
            ))}
            {kpi.unpaidEarlier.n > 0 && (
              <Row icon={<AlertCircle size={17} />} tone="bad" onClick={() => nav.go('billing')}
                title={`${kpi.unpaidEarlier.n} unpaid bills from earlier months`} sub={`${rupee(kpi.unpaidEarlier.total)} to collect`} />
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Row({ icon, title, sub, tone, onClick }: { icon: React.ReactNode; title: string; sub: string; tone: 'info' | 'warn' | 'bad' | 'neutral'; onClick: () => void }) {
  const c = { info: 'bg-[#E8F0FE] text-[#1F56C2]', warn: 'bg-[#FFF3E0] text-[#9A5500]', bad: 'bg-[#FDECEE] text-[#B42334]', neutral: 'bg-soft text-ink-2' }[tone];
  return (
    <li>
      <button onClick={onClick} className="flex w-full items-start gap-3 rounded-xl p-2.5 text-left hover:bg-soft">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${c}`}>{icon}</span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{title}</span><span className="block text-xs text-muted">{sub}</span></span>
        <ChevronRight size={16} className="mt-2 shrink-0 text-faint" />
      </button>
    </li>
  );
}

function Sources({ s }: { s: { qr: Sum; counter: Sum; apps: Sum } }) {
  const list = [
    { label: 'Guests ordered by QR', v: s.qr, color: 'var(--brand)' },
    { label: 'Staff billed at counter / table', v: s.counter, color: '#3D4152' },
    { label: 'Zomato / Swiggy (typed in)', v: s.apps, color: '#9AA0AC' },
  ];
  const total = Math.max(1, list.reduce((a, x) => a + x.v.sales, 0));
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-soft">{list.map(x => <div key={x.label} style={{ width: `${(x.v.sales / total) * 100}%`, background: x.color }} />)}</div>
      <ul className="mt-3 grid gap-3 sm:grid-cols-3">
        {list.map(x => (
          <li key={x.label} className="text-sm">
            <span className="flex items-center gap-2 text-ink-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: x.color }} />{x.label}</span>
            <span className="tabular mt-0.5 block text-lg font-extrabold">{rupee(x.v.sales)}</span>
            <span className="tabular text-xs text-muted">{Math.round((x.v.sales / total) * 100)}% · {x.v.orders} order{x.v.orders === 1 ? '' : 's'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

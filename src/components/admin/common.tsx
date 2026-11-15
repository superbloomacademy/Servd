'use client';
// Shared bits for the super admin console.
import { Pill } from '@/components/ui/kit';

export const TYPE_LABEL: Record<string, string> = { theater: 'Theater', restaurant: 'Restaurant', cafe: 'Café', stall: 'Food stall' };
export const MODE_LABEL: Record<string, string> = {
  seat_delivery: 'Seat delivery', table_bill: 'Table · running bill', table_prepay: 'Table · pay first', counter_token: 'Counter pickup', shop_qr: 'Single shop QR',
};
export const MODE_HELP: Record<string, string> = {
  seat_delivery: 'Customers pay first; a runner brings food to the seat, now or at the interval.',
  table_bill: 'Order in rounds, one bill at the end. Best for restaurants.',
  table_prepay: 'Pay for each order first, staff serve it to the table. Cafés that serve.',
  counter_token: 'Pay first, collect at the counter with the KOT number.',
  shop_qr: 'One QR at the shop. Pay the shop’s UPI, collect with the KOT number.',
};
export const DEFAULT_MODE: Record<string, string> = { theater: 'seat_delivery', restaurant: 'table_bill', cafe: 'table_prepay', stall: 'shop_qr' };
export const MODES_FOR: Record<string, string[]> = {
  theater: ['seat_delivery', 'counter_token'], restaurant: ['table_bill', 'table_prepay', 'counter_token'],
  cafe: ['table_prepay', 'table_bill', 'counter_token', 'shop_qr'], stall: ['shop_qr', 'counter_token'],
};
export const LEAD_STAGES = [
  ['new', 'New'], ['contacted', 'Contacted'], ['demo', 'Demo done'], ['trial', 'On trial'], ['won', 'Won'], ['lost', 'Lost'],
] as const;

export function PageHead({ title, sub, right }: { title: string; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-extrabold">{title}</h1>{sub && <p className="mt-1 max-w-2xl text-sm text-muted">{sub}</p>}</div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: 'brand' }) {
  return (
    <div className={`rounded-2xl bg-white p-4 ${tone === 'brand' ? 'ring-2 ring-brand-line' : ''}`}>
      <p className="text-[13px] font-semibold text-muted">{label}</p>
      <p className="tabular mt-1 text-2xl font-extrabold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function Card({ title, right, children, className = '' }: { title?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-white p-5 ${className}`}>
      {(title || right) && <div className="mb-3 flex items-center justify-between gap-3"><h2 className="font-bold">{title}</h2>{right}</div>}
      {children}
    </section>
  );
}

export function VendorStatus({ status, stage }: { status: string; stage: string }) {
  if (status === 'suspended') return <Pill tone="bad">Suspended</Pill>;
  if (stage === 'setup') return <Pill tone="warn">Setting up</Pill>;
  return <Pill tone="good">Live</Pill>;
}

export function Logo({ name, color, url, size = 40 }: { name: string; color: string; url?: string | null; size?: number }) {
  if (url) return <img src={url} alt="" className="shrink-0 rounded-xl object-cover" style={{ width: size, height: size }} />;
  return <div className="grid shrink-0 place-items-center rounded-xl font-extrabold text-white" style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}>{name.slice(0, 1)}</div>;
}

export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-soft"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct === 100 ? 'var(--good)' : 'var(--brand)' }} /></div>
      <span className="tabular text-xs text-muted">{done}/{total}</span>
    </div>
  );
}

export const day = (ts: string | Date | null | undefined) => ts ? new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
export const addDaysISO = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + n * 864e5));
export const pct = (bps: number) => `${(bps / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;

/** A 4-digit PIN that isn't trivially guessable (no 1234, 0000, 1111…). */
export function makePin() {
  for (;;) {
    const p = String(Math.floor(1000 + Math.random() * 9000));
    if (!/^(\d)\1{3}$/.test(p) && !'0123456789876543210'.includes(p)) return p;
  }
}

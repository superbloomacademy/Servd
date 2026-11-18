import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getStaff, staffCanAccessVenue } from '@/lib/auth';
import { dayReport } from '@/lib/reports';
import { localParts } from '@/lib/util';
import { PrintBar } from '../../print-bar';

export const dynamic = 'force-dynamic';
const r = (p: number) => (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PAY: Record<string, string> = { cash: 'Cash', upi_shop: 'UPI', card: 'Card', online: 'Online (apps)' };
const SRC: Record<string, string> = { qr: 'Guest QR', pos: 'Counter', zomato: 'Zomato', swiggy: 'Swiggy', phone: 'Phone', other: 'Other app' };
const t = (d: Date | string) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

// Day-end (Z) report for 80 mm thermal printers.
export default async function DayReportPrint({ params, searchParams }: { params: Promise<{ venueId: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const { venueId } = await params;
  const q = await searchParams;
  const s = await getStaff();
  if (!s || !/^[0-9a-f-]{36}$/.test(venueId) || !(await staffCanAccessVenue(s, venueId)) || !['owner', 'manager', 'cashier', 'super_admin'].includes(s.role)) return <p className="p-8">Log in to the staff app to print reports.</p>;
  const today = localParts().date;
  const rep = await dayReport(venueId, q.from || today, q.to || q.from || today).catch(() => null);
  if (!rep) return <p className="p-8">Choose a valid date.</p>;
  const v = (await db().select({ vendor: schema.vendors, venue: schema.venues }).from(schema.venues).innerJoin(schema.vendors, eq(schema.venues.vendorId, schema.vendors.id)).where(eq(schema.venues.id, venueId)))[0];
  const Row = ({ l, v: val, b }: { l: string; v: string; b?: boolean }) => <div className={`flex justify-between ${b ? 'font-bold' : ''}`}><span>{l}</span><span>{val}</span></div>;
  const Hr = () => <hr className="my-1.5 border-dashed border-black" />;

  return (
    <>
      <PrintBar label={`Day-end report · ${rep.from}${rep.to !== rep.from ? ' to ' + rep.to : ''}`} />
      <style>{`@page { size: 80mm auto; margin: 3mm } body { background: #fff }`}</style>
      <div className="mx-auto w-[74mm] py-4 font-mono text-[12px] leading-snug text-black">
        <p className="text-center font-sans text-[15px] font-bold">{v.vendor.name}</p>
        <p className="text-center">{v.venue.name}</p>
        <p className="text-center font-bold">DAY-END (Z) REPORT</p>
        <p className="text-center">{rep.from}{rep.to !== rep.from ? ` to ${rep.to}` : ''}</p>
        <p className="text-center text-[10px]">Printed {new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} by {s.name}</p>
        <Hr />
        <Row l="Bills" v={String(rep.bills.bills)} />
        <Row l="Items value" v={r(rep.bills.subtotal)} />
        <Row l="Discount" v={`-${r(rep.bills.discount)}`} />
        <Row l="Taxable value" v={r(rep.bills.taxable)} />
        <Row l="CGST" v={r(rep.bills.cgst)} />
        <Row l="SGST" v={r(rep.bills.sgst)} />
        <Row l="Round off" v={r(rep.bills.roundOff)} />
        <div className="mt-1 border-t border-black pt-1 text-[14px]"><Row l="TOTAL SALES" v={r(rep.bills.total)} b /></div>
        {rep.cancelledBills.n > 0 && <Row l={`Cancelled bills (${rep.cancelledBills.n})`} v={r(rep.cancelledBills.total)} />}
        {rep.covers.guests > 0 && <Row l="Guests (dine-in)" v={String(rep.covers.guests)} />}
        <Hr /><p className="font-bold">PAYMENT MODES</p>
        {rep.payments.map(p => <Row key={p.method} l={`${PAY[p.method] || p.method} (${p.bills})`} v={r(p.amount)} />)}
        <Hr /><p className="font-bold">ORDER SOURCE</p>
        {rep.channels.map(c => <Row key={c.channel + c.fulfilment} l={`${SRC[c.channel] || c.channel} ${c.fulfilment === 'table' ? 'dine-in' : c.fulfilment === 'pickup' ? (c.channel === 'qr' ? 'pickup' : 'takeaway') : c.fulfilment} (${c.orders})`} v={r(c.amount)} />)}
        <Hr /><p className="font-bold">CATEGORIES</p>
        {rep.categories.map(c => <Row key={c.category} l={`${c.category} (${c.qty})`} v={r(c.amount)} />)}
        <Hr /><p className="font-bold">ITEMS</p>
        {[...rep.items].sort((a, b) => b.qty - a.qty).map(i => <Row key={i.category + i.name} l={`${i.qty} x ${i.name}`} v={r(i.amount)} />)}
        {rep.discounts.length > 0 && <><Hr /><p className="font-bold">DISCOUNTS</p>{rep.discounts.map((d, i) => <Row key={i} l={`KOT ${d.kotNo} ${d.reason || d.coupon || ''}`} v={r(d.amount)} />)}</>}
        {rep.cancels.length > 0 && <><Hr /><p className="font-bold">CANCELLATIONS</p>{rep.cancels.map((c, i) => (
          <div key={i}><Row l={`${t(c.at)} KOT ${c.kotNo ?? ''} ${c.action === 'item_cancelled' ? `${c.qty} x ${c.name}` : 'whole order'}`} v={c.amountPaise ? r(c.amountPaise as number) : ''} /><p className="pl-2 text-[11px]">{String(c.reason || '')} - {c.by}</p></div>
        ))}</>}
        <Hr /><p className="font-bold">STAFF</p>
        {rep.staff.map(x => <Row key={x.name} l={`${x.name} (${x.orders})`} v={r(x.amount)} />)}
        <Hr /><p className="font-bold">CASH DRAWER</p>
        <Row l="Cash in" v={r(rep.cash.inPaise)} /><Row l="Cash out" v={`-${r(rep.cash.outPaise)}`} /><Row l="Expenses" v={`-${r(rep.cash.expensePaise)}`} />
        {rep.shifts.map(sh => <div key={sh.id} className="mt-1">
          <Row l={`Opening ${t(sh.openedAt)}`} v={r(sh.openingPaise)} />
          {sh.closedAt && <><Row l="Expected" v={r(sh.expectedPaise ?? 0)} /><Row l="Counted" v={r(sh.countedPaise ?? 0)} /><Row l="Difference" v={r((sh.countedPaise ?? 0) - (sh.expectedPaise ?? 0))} b /></>}
        </div>)}
        {(rep.open.unpaid.length > 0 || rep.open.tables > 0) && <><Hr /><p className="font-bold">STILL OPEN: {rep.open.tables} tables, {rep.open.unpaid.length} unpaid orders</p></>}
        <Hr /><p className="text-center text-[10px]">powered by servd</p>
      </div>
    </>
  );
}

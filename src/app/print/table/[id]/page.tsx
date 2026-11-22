import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getStaff, staffCanAccessVenue } from '@/lib/auth';
import { tableBill } from '@/lib/orders';
import { redirect } from 'next/navigation';
import { PrintBar } from '../../print-bar';

export const dynamic = 'force-dynamic';
const r = (p: number) => (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Table bill in the vendor's name with GSTIN / FSSAI, for thermal printers.
export default async function TableBillPrint({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string }> }) {
  const { id } = await params;
  const auto = (await searchParams).print === '1';
  const s = await getStaff();
  const bill = /^[0-9a-f-]{36}$/.test(id) ? await tableBill(id).catch(() => null) : null;
  if (!s || !bill || !(await staffCanAccessVenue(s, bill.session.venueId))) return <p className="p-8">Log in to the staff app to print bills.</p>;
  // Once the table is closed it has a numbered GST bill: show that.
  if ((await db().select({ id: schema.invoices.id }).from(schema.invoices).where(eq(schema.invoices.tableSessionId, id)))[0]) redirect(`/print/invoice/${id}${auto ? '?print=1' : ''}`);
  const v = (await db().select({ vendor: schema.vendors, venue: schema.venues }).from(schema.venues).innerJoin(schema.vendors, eq(schema.venues.vendorId, schema.vendors.id)).where(eq(schema.venues.id, bill.session.venueId)))[0];
  const lines = new Map<string, { qty: number; price: number }>();
  bill.rounds.forEach(rd => rd.items.forEach(i => { const k = `${i.name}|${i.pricePaise}`; const c = lines.get(k) || { qty: 0, price: i.pricePaise }; c.qty += i.qty; lines.set(k, c); }));
  const half = Math.round(bill.taxPaise / 2);

  return (
    <>
      <PrintBar label={`${bill.spotLabel} · ₹${r(bill.totalPaise)}`} auto={auto} />
      <style>{`@page { size: 80mm auto; margin: 3mm } body { background: #fff }`}</style>
      <div className="mx-auto w-[74mm] py-4 font-mono text-[12px] leading-snug text-black">
        {v.vendor.isDemo && <p className="mb-1 border-2 border-black text-center font-bold">SAMPLE BILL (DEMO) – NOT VALID</p>}
        <p className="text-center font-sans text-[15px] font-bold">{v.vendor.legalName || v.vendor.name}</p>
        {v.vendor.address && <p className="text-center">{v.vendor.address}</p>}
        {v.vendor.gstin && <p className="text-center">GSTIN: {v.vendor.gstin}</p>}
        {v.vendor.fssai && <p className="text-center">FSSAI: {v.vendor.fssai}</p>}
        <hr className="my-1.5 border-dashed border-black" />
        <div className="flex justify-between"><span>{bill.session.billNo ? `Bill no. ${bill.session.billNo}` : 'Bill (not settled)'}</span><span>{bill.spotLabel}</span></div>
        <p>{new Date(bill.session.closedAt || Date.now()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</p>
        <hr className="my-1.5 border-dashed border-black" />
        <table className="w-full"><thead><tr><th className="text-left">Item</th><th className="text-right">Qty</th><th className="text-right">Amt</th></tr></thead><tbody>
          {[...lines].map(([k, l]) => <tr key={k}><td>{k.split('|')[0]}</td><td className="text-right">{l.qty}</td><td className="text-right">{r(l.qty * l.price)}</td></tr>)}
        </tbody></table>
        <hr className="my-1.5 border-dashed border-black" />
        <div className="flex justify-between"><span>Sub total</span><span>{r(bill.subtotalPaise)}</span></div>
        {bill.discountPaise > 0 && <div className="flex justify-between"><span>Discount</span><span>-{r(bill.discountPaise)}</span></div>}
        <div className="flex justify-between"><span>CGST</span><span>{r(half)}</span></div>
        <div className="flex justify-between"><span>SGST</span><span>{r(bill.taxPaise - half)}</span></div>
        {bill.roundOffPaise !== 0 && <div className="flex justify-between"><span>Round off</span><span>{bill.roundOffPaise > 0 ? '+' : '-'}{r(Math.abs(bill.roundOffPaise))}</span></div>}
        <div className="mt-1 flex justify-between border-t border-black pt-1 text-[15px] font-bold"><span>TOTAL</span><span>₹{r(bill.totalPaise)}</span></div>
        {bill.duePaise !== bill.totalPaise && <div className="flex justify-between font-bold"><span>Already paid</span><span>-{r(bill.totalPaise - bill.duePaise)}</span></div>}
        {bill.duePaise !== bill.totalPaise && <div className="flex justify-between text-[15px] font-bold"><span>TO PAY</span><span>₹{r(bill.duePaise)}</span></div>}
        {bill.session.guests > 0 && <p className="mt-1">Guests: {bill.session.guests} · per guest ₹{r(Math.ceil(bill.duePaise / bill.session.guests))}</p>}
        <p className="mt-1">{bill.session.payStatus === 'paid' ? `Paid by ${bill.session.payMethod === 'cash' ? 'cash' : bill.session.payMethod === 'split' ? 'split payment' : 'UPI'}` : 'Payment pending'}</p>
        <p className="mt-3 text-center">Thank you! Visit again.</p>
        <p className="text-center text-[10px]">powered by servd</p>
      </div>
    </>
  );
}

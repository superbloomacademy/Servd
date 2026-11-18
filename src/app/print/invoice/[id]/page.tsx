import { and, eq, or } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCustomer, getStaff, staffCanAccessVenue } from '@/lib/auth';
import { inWords, type Invoice } from '@/lib/invoices';
import { PrintBar } from '../../print-bar';

export const dynamic = 'force-dynamic';
const PAY: Record<string, string> = { cash: 'cash', upi_shop: 'UPI', card: 'card', online: 'online (app)' };
const r = (p: number) => (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// GST bill. The link works with a bill id, an order id or a table bill id, so every screen can link to it.
// Who can open it: staff of that venue, or the customer whose order it is.
async function find(id: string): Promise<Invoice | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const direct = (await db().select().from(schema.invoices)
    .where(or(eq(schema.invoices.id, id), eq(schema.invoices.orderId, id), eq(schema.invoices.tableSessionId, id))))[0];
  if (direct) return direct;
  // A running-bill order: its bill is the table's bill.
  const o = (await db().select().from(schema.orders).where(eq(schema.orders.id, id)))[0];
  if (o?.tableSessionId) return (await db().select().from(schema.invoices).where(eq(schema.invoices.tableSessionId, o.tableSessionId)))[0] ?? null;
  return null;
}

async function allowed(inv: Invoice) {
  const s = await getStaff();
  if (s && await staffCanAccessVenue(s, inv.venueId)) return true;
  const c = await getCustomer();
  if (!c) return false;
  if (inv.customerId === c.id) return true;
  const where = inv.tableSessionId
    ? and(eq(schema.orders.tableSessionId, inv.tableSessionId), eq(schema.orders.customerId, c.id))
    : and(eq(schema.orders.id, inv.orderId!), eq(schema.orders.customerId, c.id));
  return !!(await db().select({ id: schema.orders.id }).from(schema.orders).where(where))[0];
}

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string }> }) {
  const { id } = await params;
  const { print } = await searchParams;
  const inv = await find(id);
  if (!inv) return <p className="p-8">The bill is made once the payment is confirmed by the staff. Please check again in a moment.</p>;
  if (!(await allowed(inv))) return <p className="p-8">Log in with the account that placed this order to see its bill.</p>;
  const { vendor: v, venue } = (await db().select({ vendor: schema.vendors, venue: schema.venues }).from(schema.venues)
    .innerJoin(schema.vendors, eq(schema.venues.vendorId, schema.vendors.id)).where(eq(schema.venues.id, inv.venueId)))[0];
  const half = inv.taxBps / 200;
  const supply = v.isDemo ? 'SAMPLE BILL (DEMO) – NOT A VALID TAX INVOICE' : inv.taxBps > 0 && v.gstin ? 'TAX INVOICE' : 'BILL OF SUPPLY';
  const at = new Date(inv.issuedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

  return (
    <>
      <PrintBar label={`Bill ${inv.number} · ₹${r(inv.totalPaise)}`} auto={print === '1'} />
      <style>{`@page { size: 80mm auto; margin: 3mm } body { background: #fff }`}</style>
      <div className="relative mx-auto w-[74mm] py-4 font-mono text-[12px] leading-snug text-black">
        {inv.status === 'cancelled' && <div className="pointer-events-none absolute inset-0 grid place-items-center"><span className="-rotate-12 border-4 border-[#B42334] px-3 py-1 font-sans text-3xl font-black text-[#B42334] opacity-70">CANCELLED</span></div>}
        {v.logoUrl && <img src={v.logoUrl} alt="" className="mx-auto mb-1 h-10 w-10 rounded object-cover" />}
        <p className="text-center font-sans text-[15px] font-bold">{v.legalName || v.name}</p>
        {v.legalName && v.legalName !== v.name && <p className="text-center">({v.name} · {venue.name})</p>}
        {(venue.address || v.address) && <p className="text-center">{venue.address || v.address}</p>}
        {v.gstin && <p className="text-center">GSTIN: {v.gstin}</p>}
        {v.fssai && <p className="text-center">FSSAI Lic. No: {v.fssai}</p>}
        <p className="mt-1.5 text-center font-sans font-bold">{supply}</p>
        <hr className="my-1.5 border-dashed border-black" />
        <div className="flex justify-between"><span>Bill No: {inv.number}</span></div>
        <div className="flex justify-between"><span>{at}</span><span>{inv.spotLabel}</span></div>
        <p>KOT: {inv.kotNos.join(', ')}</p>
        {(inv.customerName || inv.customerPhone) && <p>Customer: {inv.customerName}{inv.customerPhone ? ` (${inv.customerPhone.slice(0, 2)}xxxxxx${inv.customerPhone.slice(-2)})` : ''}</p>}
        <hr className="my-1.5 border-dashed border-black" />
        <table className="w-full"><thead><tr><th className="text-left">Item</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Amt</th></tr></thead><tbody>
          {inv.lines.map((l, i) => <tr key={i}><td className="pr-1">{l.name}</td><td className="text-right">{l.qty}</td><td className="text-right">{r(l.pricePaise)}</td><td className="text-right">{r(l.qty * l.pricePaise)}</td></tr>)}
        </tbody></table>
        <hr className="my-1.5 border-dashed border-black" />
        <div className="flex justify-between"><span>Sub total</span><span>{r(inv.subtotalPaise)}</span></div>
        {inv.discountPaise > 0 && <div className="flex justify-between"><span>Discount</span><span>-{r(inv.discountPaise)}</span></div>}
        {inv.taxBps > 0 && <>
          <div className="flex justify-between"><span>Taxable value</span><span>{r(inv.taxablePaise)}</span></div>
          <div className="flex justify-between"><span>CGST @ {half}%</span><span>{r(inv.cgstPaise)}</span></div>
          <div className="flex justify-between"><span>SGST @ {half}%</span><span>{r(inv.sgstPaise)}</span></div>
        </>}
        {inv.roundOffPaise !== 0 && <div className="flex justify-between"><span>Round off</span><span>{inv.roundOffPaise > 0 ? '+' : '-'}{r(Math.abs(inv.roundOffPaise))}</span></div>}
        <div className="mt-1 flex justify-between border-t border-black pt-1 text-[15px] font-bold"><span>TOTAL</span><span>₹{r(inv.totalPaise)}</span></div>
        <p className="mt-1 text-[11px]">{inWords(inv.totalPaise)}</p>
        <p className="mt-1">Paid by {inv.payments.length > 1 ? inv.payments.map(p => `${PAY[p.method] || p.method} ₹${r(p.amountPaise)}`).join(' + ') : PAY[inv.payments[0]?.method || inv.payMethod] || 'UPI'}</p>
        {inv.taxBps > 0 && <p className="text-[10px]">SAC 996331 · Restaurant service</p>}
        {inv.status === 'cancelled' && <p className="mt-1 font-bold">This bill was cancelled{inv.cancelledAt ? ` on ${new Date(inv.cancelledAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}` : ''}.</p>}
        <p className="mt-3 text-center">Thank you! Visit again.</p>
        <p className="text-center text-[10px]">powered by servd</p>
      </div>
    </>
  );
}

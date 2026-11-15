import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getStaff } from '@/lib/auth';
import { monthLabel, monthRange } from '@/lib/admin';
import { inWords } from '@/lib/invoices';
import { PrintBar } from '../../print-bar';

export const dynamic = 'force-dynamic';
const r = (p: number) => (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Our monthly bill to a vendor (A4). Visible to us and to that vendor's owner.
// Our own company details come from .env (PLATFORM_LEGAL_NAME, PLATFORM_ADDRESS, PLATFORM_GSTIN, PLATFORM_UPI_ID).
export default async function PlatformBill({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getStaff();
  const bill = /^[0-9a-f-]{36}$/.test(id) ? (await db().select().from(schema.platformBills).where(eq(schema.platformBills.id, id)))[0] : null;
  if (!s || !bill || !(s.role === 'super_admin' || (s.role === 'owner' && s.vendorId === bill.vendorId))) return <p className="p-8">Log in as the platform admin or the vendor’s owner to see this bill.</p>;
  const v = (await db().select().from(schema.vendors).where(eq(schema.vendors.id, bill.vendorId)))[0];
  const { start, end } = monthRange(bill.month);
  const last = new Date(end.getTime() - 1);
  const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const P = {
    name: process.env.PLATFORM_LEGAL_NAME || 'Servd', address: process.env.PLATFORM_ADDRESS || '',
    gstin: process.env.PLATFORM_GSTIN || '', upi: process.env.PLATFORM_UPI_ID || '',
  };
  const status = bill.status === 'paid' ? `PAID on ${fmt(bill.paidAt!)}${bill.reference ? ` · ref ${bill.reference}` : ''}` : bill.status === 'waived' ? 'WAIVED' : 'DUE';

  return (
    <>
      <PrintBar label={`${bill.number} · ${v.name} · ₹${r(bill.totalPaise)}`} />
      <style>{`@page { size: A4; margin: 14mm } body { background: #fff }`}</style>
      <div className="mx-auto max-w-[760px] px-6 py-8 text-[13px] text-black">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-2xl font-extrabold" style={{ fontFamily: 'var(--font-display)' }}>{P.name === 'Servd' ? <>servd<span className="text-[#E23744]">.</span></> : P.name}</p>
            {P.address && <p className="mt-1 max-w-xs text-[#444]">{P.address}</p>}
            {P.gstin && <p className="text-[#444]">GSTIN {P.gstin}</p>}
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">{P.gstin ? 'Tax invoice' : 'Monthly bill'}</p>
            <p>No. <b>{bill.number}</b></p>
            <p>Date {fmt(bill.createdAt)}</p>
            <p className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-bold ${bill.status === 'paid' ? 'bg-[#E7F6EF] text-[#11734E]' : bill.status === 'waived' ? 'bg-[#F4F5F7]' : 'bg-[#FFF3E0] text-[#9A5500]'}`}>{status}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-6 rounded-lg border border-[#ddd] p-4">
          <div><p className="text-xs font-semibold text-[#666] uppercase">Billed to</p><p className="font-bold">{v.legalName || v.name}</p>{v.address && <p>{v.address}</p>}{v.gstin && <p>GSTIN {v.gstin}</p>}{v.email && <p>{v.email}</p>}</div>
          <div><p className="text-xs font-semibold text-[#666] uppercase">Period</p><p className="font-bold">{monthLabel(bill.month)}</p><p>{fmt(start)} – {fmt(last)}</p></div>
        </div>

        <table className="mt-6 w-full">
          <thead><tr className="border-b-2 border-black text-left"><th className="py-2">Description</th><th className="py-2 text-right">Amount (₹)</th></tr></thead>
          <tbody>
            <tr className="border-b border-[#ddd]"><td className="py-2.5">Platform commission: {(bill.commissionBps / 100).toLocaleString('en-IN')}% of ₹{r(bill.salesPaise)} paid orders ({bill.orders} orders)<span className="block text-xs text-[#666]">UPI ₹{r(bill.onlinePaise)} · cash ₹{r(bill.cashPaise)}. Customer payments went directly to you.</span></td><td className="py-2.5 text-right">{r(bill.commissionPaise)}</td></tr>
            <tr className="border-b border-[#ddd]"><td className="py-2.5">Monthly platform fee</td><td className="py-2.5 text-right">{r(bill.feePaise)}</td></tr>
            <tr><td className="py-3 text-right font-bold">Total</td><td className="py-3 text-right text-lg font-extrabold">₹{r(bill.totalPaise)}</td></tr>
          </tbody>
        </table>
        <p className="text-[#444]">{inWords(bill.totalPaise)}</p>

        {bill.status === 'due' && (
          <div className="mt-6 rounded-lg bg-[#F4F5F7] p-4">
            <p className="font-bold">How to pay</p>
            <p>{P.upi ? <>UPI to <b>{P.upi}</b> with the note <b>{bill.number}</b>, within 7 days.</> : <>Please pay within 7 days and mention <b>{bill.number}</b> with the payment.</>}</p>
          </div>
        )}
        <p className="mt-10 text-center text-xs text-[#888]">Questions about this bill? Reply to the email or WhatsApp it came with.</p>
      </div>
    </>
  );
}

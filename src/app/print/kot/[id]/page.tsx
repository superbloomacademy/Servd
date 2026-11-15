import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getStaff, staffCanAccessVenue } from '@/lib/auth';
import { getFullOrder } from '@/lib/orders';
import { PrintBar } from '../../print-bar';

export const dynamic = 'force-dynamic';
const t = (d: Date | string) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

// Kitchen Order Ticket, sized for 80 mm thermal printers. ?station= prints one station's part.
export default async function KotPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ station?: string }> }) {
  const { id } = await params;
  const { station } = await searchParams;
  const s = await getStaff();
  const o = /^[0-9a-f-]{36}$/.test(id) ? await getFullOrder(id).catch(() => null) : null;
  if (!s || !o || !(await staffCanAccessVenue(s, o.venueId))) return <p className="p-8">Log in to the staff app to print KOTs.</p>;
  const v = (await db().select({ vendor: schema.vendors, venue: schema.venues }).from(schema.venues).innerJoin(schema.vendors, eq(schema.venues.vendorId, schema.vendors.id)).where(eq(schema.venues.id, o.venueId)))[0];
  const kots = station ? o.kots.filter(k => k.stationId === station) : o.kots;

  return (
    <>
      <PrintBar label={`KOT ${o.kotNo} · ${kots.length} station slip${kots.length > 1 ? 's' : ''}`} auto />
      <style>{`@page { size: 80mm auto; margin: 3mm } body { background: #fff }`}</style>
      <div className="mx-auto w-[74mm] py-4 font-mono text-[13px] leading-snug text-black">
        {kots.map(k => (
          <section key={k.id} className="mb-6 break-after-page">
            <p className="text-center font-sans text-[15px] font-bold">{v.vendor.name}</p>
            <p className="text-center">KITCHEN ORDER TICKET</p>
            <p className="text-center font-bold">{k.stationName.toUpperCase()}</p>
            <hr className="my-1.5 border-dashed border-black" />
            <div className="flex justify-between"><b>KOT #{o.kotNo}</b><span>{t(o.paidAt || o.createdAt)}</span></div>
            <p className="my-1 text-center font-sans text-2xl font-extrabold">{o.spotLabel}</p>
            {o.showLabel && <p className="text-center">{o.showLabel}</p>}
            <p className="text-center"><span className="inline-block border-2 border-black px-2 font-bold">{o.deliverAt === 'interval' ? 'AT INTERVAL' : o.fulfilment === 'pickup' ? 'COUNTER PICKUP' : o.fulfilment === 'table' ? 'SERVE AT TABLE' : 'DELIVER TO SEAT'}</span></p>
            <hr className="my-1.5 border-dashed border-black" />
            <table className="w-full text-[15px]"><tbody>
              {o.items.filter(i => i.stationId === k.stationId).map(i => <tr key={i.id}><td className="w-9 align-top font-bold">{i.qty} x</td><td>{i.name}{i.veg ? '' : ' (NV)'}</td></tr>)}
            </tbody></table>
            <hr className="my-1.5 border-dashed border-black" />
            {o.note && <p><b>NOTE:</b> {o.note}</p>}
            <p>{o.payStatus === 'paid' ? `PAID · ${o.payMethod === 'cash' ? 'CASH' : 'UPI'}` : o.payStatus === 'on_bill' ? 'ON TABLE BILL' : 'PAYMENT PENDING'}</p>
          </section>
        ))}
      </div>
    </>
  );
}

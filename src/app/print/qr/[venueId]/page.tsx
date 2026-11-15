import { publicBaseUrl } from '@/lib/env';
import { and, asc, eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import { db, schema } from '@/db';
import { getStaff, staffCanAccessVenue } from '@/lib/auth';
import { brandVars } from '@/lib/theme';
import { PrintBar } from '../../print-bar';

export const dynamic = 'force-dynamic';

// A4 sheet of seat/table stickers (50 × 72 mm) in the vendor's brand. ?area= or ?spot=
export default async function QrSheet({ params, searchParams }: { params: Promise<{ venueId: string }>; searchParams: Promise<{ area?: string; spot?: string }> }) {
  const { venueId } = await params;
  const { area, spot } = await searchParams;
  const s = await getStaff();
  if (!s || !/^[0-9a-f-]{36}$/.test(venueId) || !(await staffCanAccessVenue(s, venueId))) return <p className="p-8">Log in to the staff app to print QR codes.</p>;
  const r = (await db().select({ vendor: schema.vendors, venue: schema.venues }).from(schema.venues).innerJoin(schema.vendors, eq(schema.venues.vendorId, schema.vendors.id)).where(eq(schema.venues.id, venueId)))[0];
  const cond = [eq(schema.spots.venueId, venueId), eq(schema.spots.active, true)];
  if (spot && /^[0-9a-f-]{36}$/.test(spot)) cond.push(eq(schema.spots.id, spot)); else if (area && /^[0-9a-f-]{36}$/.test(area)) cond.push(eq(schema.spots.areaId, area));
  const spots = await db().select({ s: schema.spots, a: schema.areas }).from(schema.spots).leftJoin(schema.areas, eq(schema.spots.areaId, schema.areas.id)).where(and(...cond)).orderBy(asc(schema.spots.sort)).limit(600);
  const base = publicBaseUrl();
  const stickers = await Promise.all(spots.map(async x => ({ ...x, svg: await QRCode.toString(`${base}/q/${x.s.code}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) })));

  return (
    <div style={brandVars(r.vendor.brandColor)} className="min-h-dvh bg-soft print:bg-white">
      <PrintBar label={`${stickers.length} sticker${stickers.length > 1 ? 's' : ''} · links to ${base} · print at 100% scale`} />
      <style>{`@page { size: A4; margin: 8mm }`}</style>
      <div className="mx-auto flex max-w-[210mm] flex-wrap justify-center gap-[4mm] p-[6mm] print:p-0">
        {stickers.map(({ s: sp, a, svg }) => (
          <div key={sp.id} className="flex h-[72mm] w-[50mm] break-inside-avoid flex-col items-center overflow-hidden rounded-[3mm] border border-[#ccc] bg-white text-center">
            <div className="w-full bg-brand px-2 py-[1.5mm] text-[10px] font-extrabold text-brand-ink">{r.vendor.name}</div>
            <p className="mt-[1.5mm] text-[8.5px] font-semibold text-ink-2">Scan to order · we bring it to you</p>
            <div className="mt-[1mm] h-[34mm] w-[34mm] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
            <p className="mt-[1mm] text-[22px] leading-none font-extrabold">{sp.label}</p>
            <p className="text-[9px] text-muted">{sp.kind === 'seat' ? `${a?.name ?? ''} · Seat` : sp.kind === 'table' ? `${a?.name ?? ''} · Table` : 'Counter'}</p>
            <p className="mt-auto w-full border-t border-line py-[1mm] text-[7px] text-muted">Or tap your phone here (NFC) · powered by servd</p>
          </div>
        ))}
      </div>
    </div>
  );
}

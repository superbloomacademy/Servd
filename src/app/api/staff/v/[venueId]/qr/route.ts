import { and, asc, eq, inArray } from 'drizzle-orm';
import QRCode from 'qrcode';
import { db, schema } from '@/db';
import { route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { publicVendor } from '@/lib/menu';

const OPTS = { margin: 1, errorCorrectionLevel: 'M' as const, color: { dark: '#111111', light: '#ffffff' } };
import { publicBaseUrl } from '@/lib/env';
const baseUrl = publicBaseUrl;

// QR codes for an area (?area=) or one spot (?spot=, includes a PNG for download).
export const GET = route<{ venueId: string }>(async (req, { venueId }) => {
  await requireVenueAccess(venueId);
  const q = new URL(req.url).searchParams;
  const spotId = q.get('spot'), areaId = q.get('area');
  const cond = [eq(schema.spots.venueId, venueId)];
  if (spotId) cond.push(eq(schema.spots.id, spotId));
  else if (areaId) cond.push(eq(schema.spots.areaId, areaId));
  const spots = await db().select().from(schema.spots).where(and(...cond)).orderBy(asc(schema.spots.sort)).limit(600);
  const areaIds = [...new Set(spots.map(s => s.areaId).filter(Boolean))] as string[];
  const areas = areaIds.length ? await db().select().from(schema.areas).where(inArray(schema.areas.id, areaIds)) : [];
  const r = (await db().select({ venue: schema.venues, vendor: schema.vendors }).from(schema.venues)
    .innerJoin(schema.vendors, eq(schema.venues.vendorId, schema.vendors.id)).where(eq(schema.venues.id, venueId)))[0];
  const out = [];
  for (const s of spots) {
    const url = `${baseUrl()}/q/${s.code}`;
    out.push({
      id: s.id, label: s.label, kind: s.kind, active: s.active, code: s.code, url, codeReplacedAt: s.codeReplacedAt,
      areaName: areas.find(a => a.id === s.areaId)?.name ?? '',
      svg: await QRCode.toString(url, { ...OPTS, type: 'svg' }),
      png: spotId ? await QRCode.toDataURL(url, { ...OPTS, width: 900 }) : undefined,
    });
  }
  return { venue: { name: r.venue.name, type: r.venue.type }, vendor: publicVendor(r.vendor), baseUrl: baseUrl(), spots: out };
});

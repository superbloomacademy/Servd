import { eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import { db, schema } from '@/db';
import { bad, route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { CAN } from '@/lib/roles';
import { upiLink } from '@/components/customer/upi';

// QR for the counter: the venue's own UPI ID with the amount filled in. The venue still confirms the money arrived.
export const GET = route<{ venueId: string }>(async (req, { venueId }) => {
  await requireVenueAccess(venueId, CAN.settle);
  const amount = Number(new URL(req.url).searchParams.get('amount'));
  if (!Number.isInteger(amount) || amount <= 0 || amount > 1e9) throw bad('Amount is missing');
  const v = (await db().select().from(schema.venues).where(eq(schema.venues.id, venueId)))[0];
  if (!v?.upiId) return { upiId: '', svg: '' };
  const svg = await QRCode.toString(upiLink(v.upiId, v.upiName || v.name, amount, v.name), { type: 'svg', margin: 1 });
  return { upiId: v.upiId, svg: 'data:image/svg+xml;utf8,' + encodeURIComponent(svg) };
});

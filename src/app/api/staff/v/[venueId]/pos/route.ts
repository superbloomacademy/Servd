import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { body, notFound, route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { CAN } from '@/lib/roles';
import { createPosOrder } from '@/lib/pos';
import { bad } from '@/lib/api';
import type { StaffRole } from '@/db/schema';

const Pay = z.object({ method: z.enum(['upi_shop', 'cash', 'card', 'online']), amountPaise: z.number().int().positive() });
const Input = z.object({
  type: z.enum(['dine_in', 'takeaway', 'delivery']),
  channel: z.enum(['pos', 'zomato', 'swiggy', 'phone', 'other']).default('pos'),
  spotId: z.string().nullish(), guests: z.number().int().min(0).max(99).optional(),
  lines: z.array(z.object({
    itemId: z.string(), qty: z.number().int().min(1).max(99),
    variantId: z.string().max(40).nullish(), addonIds: z.array(z.string().max(40)).max(20).optional(), note: z.string().max(120).optional(),
  })).min(1, 'Add at least one item.').max(80),
  guestName: z.string().max(60).optional(), guestPhone: z.string().max(15).optional(), address: z.string().max(200).optional(),
  externalRef: z.string().max(40).optional(), note: z.string().max(200).optional(),
  discount: z.object({ kind: z.enum(['percent', 'flat']), value: z.number().min(0), reason: z.string().max(100) }).nullish(),
  payments: z.array(Pay).max(6).nullish(),
});

// Billing screen: a new order typed in by staff. Sends the KOT straight away; pays now or later.
export const POST = route<{ venueId: string }>(async (req, { venueId }) => {
  const s = await requireVenueAccess(venueId, CAN.pos);
  const b = Input.parse(await body(req));
  if (b.payments?.length && s.role !== 'super_admin' && !(CAN.settle as StaffRole[]).includes(s.role)) throw bad('Your role can send KOTs but not take payments.');
  if (b.discount?.value && s.role !== 'super_admin' && !(CAN.discount as StaffRole[]).includes(s.role)) throw bad('Your role cannot give discounts.');
  const venue = (await db().select().from(schema.venues).where(eq(schema.venues.id, venueId)))[0];
  if (!venue) throw notFound('Venue not found');
  const order = await createPosOrder({ venue, staff: s, ...b });
  return { order };
});

import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { bad, body, route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { CAN } from '@/lib/roles';
import { audit } from '@/lib/audit';
import { vendorIdFor } from '@/lib/vendor-access';

export const GET = route(async req => {
  const s = await requireStaff(CAN.coupons);
  const vendorId = vendorIdFor(s, req);
  return { coupons: await db().select().from(schema.coupons).where(eq(schema.coupons.vendorId, vendorId)).orderBy(desc(schema.coupons.createdAt)) };
});

const New = z.object({
  vendorId: z.string().optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, 'Code: 3–20 letters or digits'),
  type: z.enum(['percent', 'flat']), value: z.number().int().min(1),
  maxDiscountPaise: z.number().int().min(0).default(0), minOrderPaise: z.number().int().min(0).default(0),
  usageLimit: z.number().int().min(0).default(0), perCustomer: z.number().int().min(0).default(0),
  description: z.string().max(120).default(''), expiresAt: z.string().nullish(), venueId: z.string().uuid().nullish(),
});

export const POST = route(async req => {
  const s = await requireStaff(CAN.coupons);
  const b = New.parse(await body(req));
  const vendorId = vendorIdFor(s, req, b.vendorId);
  if (b.type === 'percent' && b.value > 90) throw bad('Percent discount can be at most 90%.');
  const exists = (await db().select().from(schema.coupons).where(eq(schema.coupons.vendorId, vendorId))).some(c => c.code === b.code);
  if (exists) throw bad('That code already exists.');
  const [c] = await db().insert(schema.coupons).values({
    vendorId, venueId: b.venueId ?? null, code: b.code, type: b.type, value: b.value, maxDiscountPaise: b.maxDiscountPaise,
    minOrderPaise: b.minOrderPaise, usageLimit: b.usageLimit, perCustomer: b.perCustomer, description: b.description,
    expiresAt: b.expiresAt ? new Date(`${b.expiresAt}T23:59:59+05:30`) : null,
  }).returning();
  await audit(s, { action: 'coupon_created', entity: 'coupon', entityId: c.id, vendorId, after: c });
  return { coupon: c };
});

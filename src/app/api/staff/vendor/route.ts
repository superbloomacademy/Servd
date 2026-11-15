import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { body, route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { vendorIdFor } from '@/lib/vendor-access';

export const GET = route(async req => {
  const s = await requireStaff();
  const id = vendorIdFor(s, req);
  return { vendor: (await db().select().from(schema.vendors).where(eq(schema.vendors.id, id)))[0] };
});

// Branding that appears on the vendor's menu, tracking page, KOT and bill.
const Patch = z.object({
  vendorId: z.string().optional(),
  name: z.string().trim().min(2).max(60).optional(),
  logoUrl: z.string().max(300).nullable().optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a color like #E23744').optional(),
  legalName: z.string().max(100).optional(), gstin: z.string().max(20).optional(), fssai: z.string().max(20).optional(),
  address: z.string().max(200).optional(), phone: z.string().max(15).optional(),
});

export const PATCH = route(async req => {
  const s = await requireStaff(['owner']);
  const { vendorId: bodyVendor, ...b } = Patch.parse(await body(req));
  const id = vendorIdFor(s, req, bodyVendor);
  const before = (await db().select().from(schema.vendors).where(eq(schema.vendors.id, id)))[0];
  const [after] = await db().update(schema.vendors).set(b).where(eq(schema.vendors.id, id)).returning();
  await audit(s, { action: 'branding_changed', entity: 'vendor', entityId: id, vendorId: id, before, after: b });
  return { vendor: after };
});

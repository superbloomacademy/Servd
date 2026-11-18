import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { featuresOf, type VendorFeatures } from '@/db/schema';
import { bad, forbidden } from './api';
import type { Staff } from './auth';

// Which vendor a staff request acts on. Super admin passes ?vendorId=…; everyone else uses their own.
export function vendorIdFor(s: Staff, req: Request, bodyVendorId?: unknown) {
  if (s.role === 'super_admin') {
    const v = String(bodyVendorId || new URL(req.url).searchParams.get('vendorId') || '');
    if (!/^[0-9a-f-]{36}$/.test(v)) throw bad('Choose a vendor');
    return v;
  }
  if (!s.vendorId) throw forbidden();
  return s.vendorId;
}

export const FEATURE_LABEL: Record<keyof VendorFeatures, string> = { pos: 'Billing (POS) and cash drawer', inventory: 'Inventory', customers: 'Customer list' };
/** Refuses when the venue's plan doesn't include this module (super admin switches modules per vendor). */
export async function requireFeature(venueId: string, key: keyof VendorFeatures) {
  const r = (await db().select({ v: schema.vendors }).from(schema.venues).innerJoin(schema.vendors, eq(schema.venues.vendorId, schema.vendors.id)).where(eq(schema.venues.id, venueId)))[0];
  if (r && !featuresOf(r.v)[key]) throw forbidden(`${FEATURE_LABEL[key]} is not part of your plan. Contact Servd to switch it on.`);
}

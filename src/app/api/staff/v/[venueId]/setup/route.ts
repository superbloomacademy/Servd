import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { bad, route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { checklistFor } from '@/lib/setup';

// Owner's "Get started" checklist for this venue, and the vendor's stage (setup / live).
export const GET = route<{ venueId: string }>(async (_req, { venueId }) => {
  await requireVenueAccess(venueId, ['owner', 'manager']);
  const cl = await checklistFor(venueId);
  const v = (await db().select({ vendor: schema.vendors }).from(schema.venues).innerJoin(schema.vendors, eq(schema.venues.vendorId, schema.vendors.id)).where(eq(schema.venues.id, venueId)))[0];
  return { checklist: cl, stage: v.vendor.stage, liveAt: v.vendor.liveAt, trialEndsAt: v.vendor.trialEndsAt };
});

// Owner presses "Go live" once the required steps are done.
export const POST = route<{ venueId: string }>(async (_req, { venueId }) => {
  const s = await requireVenueAccess(venueId, ['owner']);
  const cl = await checklistFor(venueId);
  if (!cl?.ready) throw bad('Finish the required steps first: ' + cl?.steps.filter(x => x.required && !x.done).map(x => x.label.toLowerCase()).join(', ') + '.');
  const venue = (await db().select().from(schema.venues).where(eq(schema.venues.id, venueId)))[0];
  const [vendor] = await db().update(schema.vendors).set({ stage: 'live', liveAt: new Date() }).where(eq(schema.vendors.id, venue.vendorId)).returning();
  await audit(s, { action: 'vendor_went_live', entity: 'vendor', entityId: vendor.id, vendorId: vendor.id, venueId });
  return { stage: vendor.stage };
});

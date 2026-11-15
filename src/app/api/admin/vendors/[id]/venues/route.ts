import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { body, notFound, route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { defaultSettings } from '@/db/schema';
import { randomCode, slugify } from '@/lib/util';

const New = z.object({
  name: z.string().trim().min(2, 'Enter the branch name').max(80),
  type: z.enum(['theater', 'restaurant', 'cafe', 'stall']),
  serviceMode: z.enum(['seat_delivery', 'table_bill', 'table_prepay', 'counter_token', 'shop_qr']),
  city: z.string().trim().max(60).default(''),
  address: z.string().trim().max(200).default(''),
  taxBps: z.number().int().min(0).max(2800).default(500),
});

// Add another venue (branch) to an existing vendor. The owner sees it in their venue switcher.
export const POST = route<{ id: string }>(async (req, { id }) => {
  const s = await requireStaff(['super_admin']);
  const vendor = /^[0-9a-f-]{36}$/.test(id) ? (await db().select().from(schema.vendors).where(eq(schema.vendors.id, id)))[0] : null;
  if (!vendor) throw notFound('Vendor not found');
  const b = New.parse(await body(req));
  const venue = await db().transaction(async tx => {
    const [venue] = await tx.insert(schema.venues).values({
      vendorId: vendor.id, name: b.name, slug: `${slugify(b.name)}-${randomCode(4)}`, type: b.type, serviceMode: b.serviceMode,
      city: b.city || null, address: b.address || null, taxBps: b.taxBps, settings: { ...defaultSettings, acceptCash: b.type !== 'theater' },
    }).returning();
    await tx.insert(schema.stations).values({ venueId: venue.id, name: b.type === 'stall' ? 'Stall' : 'Kitchen' });
    return venue;
  });
  await audit(s, { action: 'venue_added', entity: 'venue', entityId: venue.id, vendorId: vendor.id, venueId: venue.id, after: b });
  return { venue };
});

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { body, route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { CAN } from '@/lib/roles';
import { audit } from '@/lib/audit';
import { emit } from '@/lib/realtime';
import { publicBaseUrl } from '@/lib/env';

export const GET = route<{ venueId: string }>(async (_req, { venueId }) => {
  await requireVenueAccess(venueId);
  const v = (await db().select().from(schema.venues).where(eq(schema.venues.id, venueId)))[0];
  return { venue: v, publicBaseUrl: publicBaseUrl() };
});

const Patch = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  serviceMode: z.enum(['seat_delivery', 'table_bill', 'table_prepay', 'counter_token', 'shop_qr']).optional(),
  address: z.string().max(200).optional(), city: z.string().max(60).optional(),
  upiId: z.string().trim().max(60).regex(/^$|^[\w.\-]{2,}@[a-zA-Z]{2,}$/, 'UPI ID looks wrong, e.g. shopname@okaxis').optional(),
  upiName: z.string().max(60).optional(), upiQrUrl: z.string().max(300).nullable().optional(),
  taxBps: z.number().int().min(0).max(2800).optional(),
  isOpen: z.boolean().optional(),
  openTime: z.string().regex(/^\d{2}:\d{2}$/).optional(), closeTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  settings: z.object({
    acceptCash: z.boolean(), unpaidCancelMin: z.number().int().min(2).max(120), startBeforePayment: z.boolean(),
    rescanMinutes: z.number().int().min(10).max(600), sessionHours: z.number().int().min(1).max(24),
    pauseLastMin: z.number().int().min(0).max(120), showWindowBeforeMin: z.number().int().min(0).max(120),
    roundOff: z.boolean(), approveFirstOrder: z.boolean(),
  }).partial().optional(),
});

export const PATCH = route<{ venueId: string }>(async (req, { venueId }) => {
  const b = Patch.parse(await body(req));
  // Opening / closing the venue for orders is allowed for managers; everything else is owner-only.
  const onlyOpen = Object.keys(b).length === 1 && 'isOpen' in b;
  const s = await requireVenueAccess(venueId, onlyOpen ? ['owner', 'manager'] : CAN.settings);
  const before = (await db().select().from(schema.venues).where(eq(schema.venues.id, venueId)))[0];
  const { settings, ...rest } = b;
  const [after] = await db().update(schema.venues).set({ ...rest, ...(settings ? { settings: { ...before.settings, ...settings } } : {}) })
    .where(eq(schema.venues.id, venueId)).returning();
  await audit(s, { action: onlyOpen ? (b.isOpen ? 'venue_opened' : 'venue_paused') : 'venue_settings_changed', entity: 'venue', entityId: venueId, venueId, before, after: b });
  emit(`menu:${venueId}`, 'menu', { venue: true });
  return { venue: after };
});

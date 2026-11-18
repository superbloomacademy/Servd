import { and, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { bad, body, route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { defaultSettings } from '@/db/schema';
import { cleanPhone, hashPin, localParts, randomCode, slugify } from '@/lib/util';
import { checklists } from '@/lib/setup';
import { isSale } from '@/lib/admin';

// All vendors with their stage, owner, venues, 30-day sales and setup progress.
export const GET = route(async () => {
  await requireStaff(['super_admin']);
  const d = db();
  const since = new Date(new Date(`${localParts().date}T00:00:00+05:30`).getTime() - 29 * 864e5);
  const [vendors, venues, owners, sales] = await Promise.all([
    d.select().from(schema.vendors).orderBy(schema.vendors.createdAt),
    d.select().from(schema.venues),
    d.select().from(schema.staff).where(eq(schema.staff.role, 'owner')),
    d.select({ vendorId: schema.orders.vendorId, orders: sql<number>`count(*)::int`, sales: sql<number>`sum(${schema.orders.totalPaise})::int` })
      .from(schema.orders).where(and(isSale(), gte(schema.orders.paidAt, since))).groupBy(schema.orders.vendorId),
  ]);
  const lists = await checklists(venues, vendors);
  return {
    vendors: vendors.map(v => {
      const vs = venues.filter(x => x.vendorId === v.id);
      const cl = vs.map(x => lists.get(x.id)!);
      const owner = owners.find(o => o.vendorId === v.id);
      const s = sales.find(x => x.vendorId === v.id);
      return {
        id: v.id, name: v.name, brandColor: v.brandColor, logoUrl: v.logoUrl, status: v.status, stage: v.stage, liveAt: v.liveAt, isDemo: v.isDemo,
        trialEndsAt: v.trialEndsAt, createdAt: v.createdAt, city: vs[0]?.city ?? '', types: [...new Set(vs.map(x => x.type))],
        owner: owner ? { name: owner.name, phone: owner.phone } : null, venues: vs.length,
        orders30: s?.orders ?? 0, sales30: s?.sales ?? 0, commissionBps: v.commissionBps, monthlyFeePaise: v.monthlyFeePaise,
        setup: { done: cl.reduce((a, c) => a + c.done, 0), total: cl.reduce((a, c) => a + c.total, 0), ready: cl.length > 0 && cl.every(c => c.ready) },
      };
    }),
  };
});

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const opt = (max: number) => z.string().trim().max(max).default('');
const New = z.object({
  // 1. Business
  vendorName: z.string().trim().min(2, 'Enter the business name').max(60),
  legalName: opt(100), contactName: opt(60), businessPhone: opt(15), email: z.string().trim().max(80).regex(/^$|^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Email looks wrong').default(''),
  gstin: z.string().trim().toUpperCase().regex(/^$|^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'GSTIN should be 15 characters, like 36ABCDE1234F1Z5').default(''),
  fssai: z.string().trim().regex(/^$|^\d{14}$/, 'FSSAI licence number is 14 digits').default(''),
  address: opt(200), brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#E23744'),
  // 2. First venue
  venueName: z.string().trim().min(2, 'Enter the venue / branch name').max(80),
  type: z.enum(['theater', 'restaurant', 'cafe', 'stall']),
  serviceMode: z.enum(['seat_delivery', 'table_bill', 'table_prepay', 'counter_token', 'shop_qr']),
  city: opt(60), taxBps: z.number().int().min(0).max(2800).default(500),
  openTime: z.string().regex(/^\d{2}:\d{2}$/).default('09:00'), closeTime: z.string().regex(/^\d{2}:\d{2}$/).default('23:00'),
  upiId: z.string().trim().max(60).regex(/^$|^[\w.\-]{2,}@[a-zA-Z]{2,}$/, 'UPI ID looks wrong, e.g. shopname@okaxis').default(''),
  // 3. Owner login
  ownerName: z.string().trim().min(2, 'Enter the owner’s name').max(40),
  ownerPhone: z.string(), ownerPin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4–6 digits'),
  // 4. Plan
  commissionBps: z.number().int().min(0).max(3000).default(0),
  monthlyFeePaise: z.number().int().min(0).max(10_000_000).default(0),
  trialDays: z.number().int().min(0).max(365).default(0),
  features: z.object({ pos: z.boolean(), inventory: z.boolean(), customers: z.boolean() }).partial().default({}),
  leadId: z.string().uuid().nullish(),
});

// Onboard a new vendor: business + first venue + owner login + a default kitchen station.
export const POST = route(async req => {
  const s = await requireStaff(['super_admin']);
  const b = New.parse(await body(req));
  const phone = cleanPhone(b.ownerPhone);
  if (!phone) throw bad('Enter a valid 10-digit owner mobile number');
  if (b.gstin && !GSTIN.test(b.gstin)) throw bad('GSTIN looks wrong');
  if ((await db().select().from(schema.staff).where(eq(schema.staff.phone, phone)))[0]) throw bad('This mobile number already has a staff or owner login. Use a different number.', 'phone_taken');
  const out = await db().transaction(async tx => {
    const [v] = await tx.insert(schema.vendors).values({
      name: b.vendorName, slug: `${slugify(b.vendorName)}-${randomCode(4)}`, brandColor: b.brandColor,
      legalName: b.legalName || null, contactName: b.contactName || b.ownerName, phone: b.businessPhone || phone, email: b.email || null,
      gstin: b.gstin || null, fssai: b.fssai || null, address: b.address || null,
      commissionBps: b.commissionBps, monthlyFeePaise: b.monthlyFeePaise,
      trialEndsAt: b.trialDays ? new Date(Date.now() + b.trialDays * 864e5) : null, stage: 'setup', features: b.features,
    }).returning();
    const [venue] = await tx.insert(schema.venues).values({
      vendorId: v.id, name: b.venueName, slug: `${slugify(b.venueName)}-${randomCode(4)}`, type: b.type, serviceMode: b.serviceMode,
      city: b.city || null, address: b.address || null, taxBps: b.taxBps, openTime: b.openTime, closeTime: b.closeTime,
      upiId: b.upiId || null, upiName: b.upiId ? (b.legalName || b.vendorName) : null,
      settings: { ...defaultSettings, acceptCash: b.type !== 'theater' },
    }).returning();
    await tx.insert(schema.stations).values({ venueId: venue.id, name: b.type === 'stall' ? 'Stall' : 'Kitchen' });
    const [owner] = await tx.insert(schema.staff).values({ name: b.ownerName, phone, pinHash: hashPin(b.ownerPin), role: 'owner', vendorId: v.id }).returning();
    if (b.leadId) await tx.update(schema.leads).set({ stage: 'won', vendorId: v.id, updatedAt: new Date() }).where(eq(schema.leads.id, b.leadId));
    return { vendor: v, venue, owner: { name: owner.name, phone: owner.phone } };
  });
  await audit(s, { action: 'vendor_onboarded', entity: 'vendor', entityId: out.vendor.id, vendorId: out.vendor.id, after: { ...b, ownerPin: '••••' } });
  return out;
});

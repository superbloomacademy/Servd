import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { body, notFound, route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { localParts } from '@/lib/util';
import { checklists } from '@/lib/setup';
import { invoicePrefix } from '@/lib/invoices';
import { isSale } from '@/lib/admin';
import { featuresOf } from '@/db/schema';

const uuid = (id: string) => /^[0-9a-f-]{36}$/.test(id);
async function load(id: string) {
  const v = uuid(id) ? (await db().select().from(schema.vendors).where(eq(schema.vendors.id, id)))[0] : null;
  if (!v) throw notFound('Vendor not found');
  return v;
}

// Everything about one vendor: details, venues with setup progress and sales, logins, monthly bills, recent activity.
export const GET = route<{ id: string }>(async (_req, { id }) => {
  await requireStaff(['super_admin']);
  const v = await load(id);
  const d = db();
  const venues = await d.select().from(schema.venues).where(eq(schema.venues.vendorId, v.id)).orderBy(schema.venues.createdAt);
  const ids = venues.map(x => x.id);
  const since = new Date(new Date(`${localParts().date}T00:00:00+05:30`).getTime() - 29 * 864e5);
  const [usage, last, mats, drawers] = ids.length ? await Promise.all([
    d.select({ venueId: schema.orders.venueId, channel: schema.orders.channel, orders: sql<number>`count(*)::int`, sales: sql<number>`sum(${schema.orders.totalPaise})::int` })
      .from(schema.orders).where(and(inArray(schema.orders.venueId, ids), isSale(), gte(schema.orders.paidAt, since))).groupBy(schema.orders.venueId, schema.orders.channel),
    d.select({ venueId: schema.orders.venueId, at: sql<string>`max(${schema.orders.createdAt})` }).from(schema.orders).where(inArray(schema.orders.venueId, ids)).groupBy(schema.orders.venueId),
    d.select({ venueId: schema.stockItems.venueId, n: sql<number>`count(*)::int` }).from(schema.stockItems).where(and(inArray(schema.stockItems.venueId, ids), eq(schema.stockItems.active, true))).groupBy(schema.stockItems.venueId),
    d.select({ venueId: schema.cashShifts.venueId, n: sql<number>`count(*)::int` }).from(schema.cashShifts).where(and(inArray(schema.cashShifts.venueId, ids), gte(schema.cashShifts.openedAt, since))).groupBy(schema.cashShifts.venueId),
  ]) : [[], [], [], []];
  const src = (venueId: string, f: (c: string) => boolean) => usage.filter(u => u.venueId === venueId && f(u.channel))
    .reduce((a, u) => ({ orders: a.orders + u.orders, sales: a.sales + (u.sales || 0) }), { orders: 0, sales: 0 });
  const [team, sales, bills, activity, lists] = await Promise.all([
    d.select().from(schema.staff).where(eq(schema.staff.vendorId, v.id)).orderBy(schema.staff.createdAt),
    ids.length ? d.select({ venueId: schema.orders.venueId, orders: sql<number>`count(*)::int`, sales: sql<number>`sum(${schema.orders.totalPaise})::int`,
      cash: sql<number>`coalesce(sum(${schema.orders.totalPaise}) filter (where ${schema.orders.payMethod} = 'cash'),0)::int` })
      .from(schema.orders).where(and(inArray(schema.orders.venueId, ids), isSale(), gte(schema.orders.paidAt, since))).groupBy(schema.orders.venueId) : [],
    d.select().from(schema.platformBills).where(eq(schema.platformBills.vendorId, v.id)).orderBy(desc(schema.platformBills.month)),
    d.select().from(schema.auditLog).where(eq(schema.auditLog.vendorId, v.id)).orderBy(desc(schema.auditLog.at)).limit(30),
    checklists(venues, [v]),
  ]);
  return {
    vendor: { ...v, invoicePrefixShown: invoicePrefix(v), features: featuresOf(v) },
    venues: venues.map(x => ({
      id: x.id, name: x.name, type: x.type, serviceMode: x.serviceMode, city: x.city, isOpen: x.isOpen, upiId: x.upiId, taxBps: x.taxBps,
      sales30: sales.find(s => s.venueId === x.id) ?? { orders: 0, sales: 0, cash: 0 }, checklist: lists.get(x.id),
      usage: {
        qr: src(x.id, c => c === 'qr'), counter: src(x.id, c => c === 'pos' || c === 'phone'), apps: src(x.id, c => c === 'zomato' || c === 'swiggy' || c === 'other'),
        lastOrderAt: last.find(l => l.venueId === x.id)?.at ?? null, materials: mats.find(m => m.venueId === x.id)?.n ?? 0, drawerDays: drawers.find(m => m.venueId === x.id)?.n ?? 0,
      },
    })),
    team: team.map(({ pinHash: _p, ...m }) => ({ ...m, venueName: venues.find(x => x.id === m.venueId)?.name ?? (m.role === 'owner' ? 'All venues' : '') })),
    bills, activity,
  };
});

const Patch = z.object({
  status: z.enum(['active', 'suspended']).optional(),
  stage: z.enum(['setup', 'live']).optional(),
  commissionBps: z.number().int().min(0).max(3000).optional(),
  monthlyFeePaise: z.number().int().min(0).max(10_000_000).optional(),
  trialEndsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  name: z.string().trim().min(2).max(60).optional(),
  legalName: z.string().trim().max(100).optional(),
  contactName: z.string().trim().max(60).optional(),
  phone: z.string().trim().max(15).optional(),
  email: z.string().trim().max(80).regex(/^$|^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Email looks wrong').optional(),
  gstin: z.string().trim().toUpperCase().regex(/^$|^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'GSTIN should be 15 characters, like 36ABCDE1234F1Z5').optional(),
  fssai: z.string().trim().regex(/^$|^\d{14}$/, 'FSSAI licence number is 14 digits').optional(),
  address: z.string().trim().max(200).optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  invoicePrefix: z.string().trim().toUpperCase().regex(/^$|^[A-Z0-9]{1,5}$/, 'Bill prefix: up to 5 letters or numbers').optional(),
  notes: z.string().max(4000).optional(),
  features: z.object({ pos: z.boolean(), inventory: z.boolean(), customers: z.boolean() }).partial().optional(),
});

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const s = await requireStaff(['super_admin']);
  const before = await load(id);
  const { trialEndsAt, stage, ...b } = Patch.parse(await body(req));
  const { features, ...rest } = b;
  const set: Partial<typeof schema.vendors.$inferInsert> = { ...rest };
  if (features) set.features = { ...featuresOf(before), ...features };
  for (const k of ['legalName', 'contactName', 'phone', 'email', 'gstin', 'fssai', 'address', 'invoicePrefix'] as const) if (set[k] === '') set[k] = null;
  if (trialEndsAt !== undefined) set.trialEndsAt = trialEndsAt ? new Date(`${trialEndsAt}T23:59:59+05:30`) : null;
  if (stage) { set.stage = stage; set.liveAt = stage === 'live' ? (before.liveAt ?? new Date()) : null; }
  const [after] = await db().update(schema.vendors).set(set).where(eq(schema.vendors.id, id)).returning();
  const action = features && Object.keys(set).length === 1 ? 'vendor_modules_changed' : b.status ? (b.status === 'suspended' ? 'vendor_suspended' : 'vendor_reactivated') : stage ? (stage === 'live' ? 'vendor_went_live' : 'vendor_back_to_setup') : 'vendor_updated';
  if (!(Object.keys(set).length === 1 && 'notes' in set)) await audit(s, { action, entity: 'vendor', entityId: id, vendorId: id, before, after: set });
  return { vendor: after };
});

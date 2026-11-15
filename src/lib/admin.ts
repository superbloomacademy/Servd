// Super admin helpers: month ranges and what each vendor owes us for a month.
import { and, eq, gte, lt, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { localParts } from './util';

export const thisMonth = () => localParts().date.slice(0, 7);
export const isMonth = (m: unknown): m is string => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

/** Start (inclusive) and end (exclusive) of a month in India time. */
export function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { start: new Date(`${month}-01T00:00:00+05:30`), end: new Date(`${next}-01T00:00:00+05:30`) };
}

export type VendorDue = {
  vendorId: string; orders: number; salesPaise: number; onlinePaise: number; cashPaise: number;
  commissionBps: number; commissionPaise: number; feePaise: number; totalPaise: number; trialNote: string | null;
};

/**
 * What every vendor owes for a month:
 * - commission % on paid orders (orders paid during a free trial are not charged)
 * - the monthly fee, if the vendor was live and out of trial before the month ended.
 */
export async function monthlyDues(month: string): Promise<Map<string, VendorDue>> {
  const { start, end } = monthRange(month);
  const vendors = await db().select().from(schema.vendors);
  const rows = await db().select({
    vendorId: schema.orders.vendorId,
    orders: sql<number>`count(*)::int`,
    sales: sql<number>`coalesce(sum(${schema.orders.totalPaise}),0)::int`,
    cash: sql<number>`coalesce(sum(${schema.orders.totalPaise}) filter (where ${schema.orders.payMethod} = 'cash'),0)::int`,
    chargeable: sql<number>`coalesce(sum(${schema.orders.totalPaise}) filter (where ${schema.vendors.trialEndsAt} is null or ${schema.orders.paidAt} >= ${schema.vendors.trialEndsAt}),0)::int`,
  }).from(schema.orders)
    .innerJoin(schema.vendors, eq(schema.orders.vendorId, schema.vendors.id))
    .where(and(isSale(), gte(schema.orders.paidAt, start), lt(schema.orders.paidAt, end)))
    .groupBy(schema.orders.vendorId);
  const out = new Map<string, VendorDue>();
  for (const v of vendors) {
    if (v.createdAt >= end) continue;
    const r = rows.find(x => x.vendorId === v.id);
    const sales = r?.sales ?? 0, cash = r?.cash ?? 0;
    const commission = Math.round((r?.chargeable ?? 0) * v.commissionBps / 10000);
    const inTrialAllMonth = !!v.trialEndsAt && v.trialEndsAt >= end;
    const live = !!v.liveAt && v.liveAt < end;
    const fee = live && !inTrialAllMonth ? v.monthlyFeePaise : 0;
    const trialNote = v.trialEndsAt && v.trialEndsAt > start
      ? (inTrialAllMonth ? 'Free trial all month' : `Free trial until ${v.trialEndsAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}`)
      : null;
    out.set(v.id, {
      vendorId: v.id, orders: r?.orders ?? 0, salesPaise: sales, onlinePaise: sales - cash, cashPaise: cash,
      commissionBps: v.commissionBps, commissionPaise: commission, feePaise: fee, totalPaise: commission + fee, trialNote,
    });
  }
  return out;
}

export const monthLabel = (month: string) =>
  new Date(`${month}-15T12:00:00+05:30`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

// Lead form (super admin → Leads).
export const LeadInput = z.object({
  business: z.string().trim().min(2, 'Enter the business name').max(80),
  contactName: z.string().trim().max(60).default(''),
  phone: z.string().trim().max(15).default(''),
  email: z.string().trim().max(80).default(''),
  city: z.string().trim().max(60).default(''),
  type: z.enum(['theater', 'restaurant', 'cafe', 'stall']).default('restaurant'),
  stage: z.enum(['new', 'contacted', 'demo', 'trial', 'won', 'lost']).default('new'),
  source: z.string().trim().max(60).default(''),
  notes: z.string().max(2000).default(''),
  nextFollowUp: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});

/** A real sale: paid, and not rejected/cancelled afterwards (those are refunded). Use wherever money is counted. */
export const isSale = () => and(eq(schema.orders.payStatus, 'paid'), notInArray(schema.orders.status, ['rejected', 'cancelled']));

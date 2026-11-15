import { publicBaseUrl } from './env';
import { cookies } from 'next/headers';
import { and, eq, gt } from 'drizzle-orm';
import { db, schema } from '@/db';
import { newToken } from './util';
import { forbidden, unauthorized } from './api';
import type { StaffRole } from '@/db/schema';

export const CUSTOMER_COOKIE = 'sv_c';
export const STAFF_COOKIE = 'sv_s';
const CUSTOMER_DAYS = 180;
const STAFF_DAYS = 14;

export type Staff = typeof schema.staff.$inferSelect;
export type Customer = typeof schema.customers.$inferSelect;

export async function createSession(kind: 'customer' | 'staff', id: string) {
  const token = newToken();
  const days = kind === 'customer' ? CUSTOMER_DAYS : STAFF_DAYS;
  const expiresAt = new Date(Date.now() + days * 864e5);
  await db().insert(schema.sessions).values({
    token, kind, expiresAt, customerId: kind === 'customer' ? id : null, staffId: kind === 'staff' ? id : null,
  });
  (await cookies()).set(kind === 'customer' ? CUSTOMER_COOKIE : STAFF_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/', expires: expiresAt, secure: process.env.NODE_ENV === 'production' && publicBaseUrl().startsWith('https'),
  });
}

export async function endSession(kind: 'customer' | 'staff') {
  const jar = await cookies();
  const name = kind === 'customer' ? CUSTOMER_COOKIE : STAFF_COOKIE;
  const t = jar.get(name)?.value;
  if (t) await db().delete(schema.sessions).where(eq(schema.sessions.token, t));
  jar.delete(name);
}

export async function staffFromToken(token: string | undefined | null) {
  if (!token) return null;
  const r = await db().select({ s: schema.staff }).from(schema.sessions)
    .innerJoin(schema.staff, eq(schema.sessions.staffId, schema.staff.id))
    .where(and(eq(schema.sessions.token, token), gt(schema.sessions.expiresAt, new Date()), eq(schema.staff.active, true)));
  return r[0]?.s ?? null;
}
export async function customerFromToken(token: string | undefined | null) {
  if (!token) return null;
  const r = await db().select({ c: schema.customers }).from(schema.sessions)
    .innerJoin(schema.customers, eq(schema.sessions.customerId, schema.customers.id))
    .where(and(eq(schema.sessions.token, token), gt(schema.sessions.expiresAt, new Date())));
  return r[0]?.c ?? null;
}

export async function getCustomer() { return customerFromToken((await cookies()).get(CUSTOMER_COOKIE)?.value); }
export async function getStaff() { return staffFromToken((await cookies()).get(STAFF_COOKIE)?.value); }

export async function requireCustomer() {
  const c = await getCustomer();
  if (!c) throw unauthorized('Log in with your phone number to continue.');
  return c;
}
export async function requireStaff(roles?: StaffRole[]) {
  const s = await getStaff();
  if (!s) throw unauthorized('Your staff session has ended. Log in again.');
  if (roles && !roles.includes(s.role) && s.role !== 'super_admin') throw forbidden();
  return s;
}

// Venues a staff member may act on.
export async function staffVenueIds(s: Staff): Promise<string[] | 'all'> {
  if (s.role === 'super_admin') return 'all';
  if (s.venueId) return [s.venueId];
  if (s.role === 'owner' && s.vendorId) {
    const v = await db().select({ id: schema.venues.id }).from(schema.venues).where(eq(schema.venues.vendorId, s.vendorId));
    return v.map(x => x.id);
  }
  return [];
}
export async function staffCanAccessVenue(s: Staff, venueId: string) {
  const ids = await staffVenueIds(s);
  return ids === 'all' || ids.includes(venueId);
}
export async function requireVenueAccess(venueId: string, roles?: StaffRole[]) {
  const s = await requireStaff(roles);
  if (!(await staffCanAccessVenue(s, venueId))) throw forbidden();
  return s;
}

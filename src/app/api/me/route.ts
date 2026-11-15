import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { body, route } from '@/lib/api';
import { getCustomer, requireCustomer } from '@/lib/auth';

export const GET = route(async () => {
  const c = await getCustomer();
  return { customer: c ? { name: c.name, phone: c.phone, email: c.email, since: c.createdAt } : null };
});

export const PATCH = route(async req => {
  const c = await requireCustomer();
  const b = await body<{ name?: string }>(req);
  const set: Partial<typeof schema.customers.$inferInsert> = {};
  if (b.name !== undefined) set.name = String(b.name).trim().slice(0, 40);
  const [u] = await db().update(schema.customers).set(set).where(eq(schema.customers.id, c.id)).returning();
  return { customer: { name: u.name, phone: u.phone, email: u.email, since: u.createdAt } };
});

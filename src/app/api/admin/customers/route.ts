import { desc, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';

// Find a customer by phone, email or name (for support), with their order history summary.
export const GET = route(async req => {
  await requireStaff(['super_admin']);
  const q = (new URL(req.url).searchParams.get('q') || '').trim().toLowerCase().slice(0, 80);
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const where = q ? sql`(${schema.customers.phone} like ${like} or lower(${schema.customers.email}) like ${like} or lower(${schema.customers.name}) like ${like})` : undefined;
  const rows = await db().select({
    c: schema.customers,
    orders: sql<number>`(select count(*)::int from ${schema.orders} o where o.customer_id = ${schema.customers.id})`,
    spent: sql<number>`(select coalesce(sum(o.total_paise),0)::int from ${schema.orders} o where o.customer_id = ${schema.customers.id} and o.pay_status = 'paid')`,
    lastAt: sql<string | null>`(select max(o.created_at) from ${schema.orders} o where o.customer_id = ${schema.customers.id})`,
    venues: sql<number>`(select count(distinct o.venue_id)::int from ${schema.orders} o where o.customer_id = ${schema.customers.id})`,
  }).from(schema.customers).where(where).orderBy(desc(schema.customers.createdAt)).limit(100);
  const total = (await db().select({ n: sql<number>`count(*)::int` }).from(schema.customers))[0].n;
  return { total, customers: rows.map(r => ({ id: r.c.id, name: r.c.name, phone: r.c.phone, email: r.c.email, createdAt: r.c.createdAt, orders: r.orders, spent: r.spent, lastAt: r.lastAt, venues: r.venues })) };
});


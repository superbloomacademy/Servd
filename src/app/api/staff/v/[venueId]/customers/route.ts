import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { route } from '@/lib/api';
import { requireVenueAccess } from '@/lib/auth';
import { CAN } from '@/lib/roles';
import { requireFeature } from '@/lib/vendor-access';

// Customer list for the owner's business (all its venues): visits, spend, last visit, favourite item.
// Everyone who ordered by QR, or gave a phone number at the counter. Paid, non-refunded orders only.
export const GET = route<{ venueId: string }>(async (req, { venueId }) => {
  await requireVenueAccess(venueId, CAN.customers);
  await requireFeature(venueId, 'customers');
  const v = (await db().select({ vendorId: schema.venues.vendorId }).from(schema.venues).where(eq(schema.venues.id, venueId)))[0];
  const q = (new URL(req.url).searchParams.get('q') || '').trim().slice(0, 40);
  const like = `%${q.replace(/[%_\\]/g, '')}%`;
  const r = await db().execute(sql`
    with s as (
      select o.customer_id, count(*)::int as orders, sum(o.total_paise)::int as spend,
        min(o.paid_at) as first_at, max(o.paid_at) as last_at, max(nullif(o.guest_name, '')) as guest_name
      from orders o
      where o.vendor_id = ${v.vendorId} and o.customer_id is not null and o.pay_status = 'paid' and o.status not in ('rejected', 'cancelled')
      group by o.customer_id
    ), fav as (
      select distinct on (o.customer_id) o.customer_id, oi.name, sum(oi.qty) as n
      from orders o join order_items oi on oi.order_id = o.id
      where o.vendor_id = ${v.vendorId} and o.customer_id is not null and o.pay_status = 'paid' and o.status not in ('rejected', 'cancelled')
      group by o.customer_id, oi.name order by o.customer_id, n desc
    )
    select c.id, coalesce(nullif(c.name, ''), s.guest_name, '') as name, c.phone, s.orders, s.spend, s.first_at as "firstAt", s.last_at as "lastAt", fav.name as favourite
    from s join customers c on c.id = s.customer_id left join fav on fav.customer_id = s.customer_id
    where ${q ? sql`(c.name ilike ${like} or c.phone like ${like} or s.guest_name ilike ${like})` : sql`true`}
    order by s.last_at desc limit 500`);
  return { customers: r.rows };
});

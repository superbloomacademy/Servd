import { and, eq, gte, lt, lte, notInArray, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { localParts } from '@/lib/util';
import { isSale, monthlyDues, thisMonth } from '@/lib/admin';

// Super admin home: platform numbers, sales trend, and the list of things that need us today.
export const GET = route(async () => {
  await requireStaff(['super_admin']);
  const d = db();
  const today = localParts().date;
  const startToday = new Date(`${today}T00:00:00+05:30`);
  const since = (days: number) => new Date(startToday.getTime() - (days - 1) * 864e5);
  const paid = isSale();

  const sum = async (from: Date) => (await d.select({
    orders: sql<number>`count(*)::int`, sales: sql<number>`coalesce(sum(${schema.orders.totalPaise}),0)::int`,
  }).from(schema.orders).where(and(paid, gte(schema.orders.paidAt, from))))[0];
  const [t, w, m] = await Promise.all([sum(startToday), sum(since(7)), sum(since(30))]);

  const byDay = await d.select({
    day: sql<string>`to_char(${schema.orders.paidAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`,
    sales: sql<number>`coalesce(sum(${schema.orders.totalPaise}),0)::int`, orders: sql<number>`count(*)::int`,
  }).from(schema.orders).where(and(paid, gte(schema.orders.paidAt, since(14)))).groupBy(sql`1`).orderBy(sql`1`);
  const days = Array.from({ length: 14 }, (_, i) => {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(since(14).getTime() + i * 864e5 + 6 * 3600e3));
    const r = byDay.find(x => x.day === day);
    return { day, sales: r?.sales ?? 0, orders: r?.orders ?? 0 };
  });

  const vendors = await d.select().from(schema.vendors);
  const venues = await d.select().from(schema.venues);
  const customers = (await d.select({ n: sql<number>`count(*)::int`, recent: sql<number>`(count(*) filter (where ${schema.customers.createdAt} >= ${since(30)}))::int` }).from(schema.customers))[0];

  const top = await d.select({ venueId: schema.orders.venueId, sales: sql<number>`sum(${schema.orders.totalPaise})::int`, orders: sql<number>`count(*)::int` })
    .from(schema.orders).where(and(paid, gte(schema.orders.paidAt, since(30)))).groupBy(schema.orders.venueId).orderBy(sql`2 desc`).limit(6);

  // This month's dues and anything still unpaid from earlier months.
  const dues = await monthlyDues(thisMonth());
  const monthDue = [...dues.values()].reduce((a, x) => a + x.totalPaise, 0);
  const unpaid = (await d.select({ n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${schema.platformBills.totalPaise}),0)::int` })
    .from(schema.platformBills).where(and(eq(schema.platformBills.status, 'due'), lt(schema.platformBills.month, thisMonth()))))[0];

  // Needs attention
  const followUps = await d.select().from(schema.leads)
    .where(and(lte(schema.leads.nextFollowUp, today), notInArray(schema.leads.stage, ['won', 'lost']))).orderBy(schema.leads.nextFollowUp).limit(8);
  const oldTickets = await d.select({ t: schema.supportTickets, venue: schema.venues.name }).from(schema.supportTickets)
    .leftJoin(schema.venues, eq(schema.supportTickets.venueId, schema.venues.id))
    .where(and(eq(schema.supportTickets.status, 'open'), lt(schema.supportTickets.createdAt, new Date(Date.now() - 24 * 3600e3)))).limit(8);
  const activeVenueIds = (await d.select({ id: schema.orders.venueId }).from(schema.orders)
    .where(gte(schema.orders.createdAt, since(7))).groupBy(schema.orders.venueId)).map(r => r.id);
  const quiet = venues.filter(v => {
    const vd = vendors.find(x => x.id === v.vendorId);
    return vd?.stage === 'live' && vd.status === 'active' && !activeVenueIds.includes(v.id);
  });
  const trialsEnding = vendors.filter(v => v.trialEndsAt && v.trialEndsAt > new Date() && v.trialEndsAt < new Date(Date.now() + 7 * 864e5));

  // Where orders come from (30 days): guests by QR (our commission), staff at the counter, delivery apps.
  const byChannel = await d.select({ venueId: schema.orders.venueId, channel: schema.orders.channel, orders: sql<number>`count(*)::int`, sales: sql<number>`sum(${schema.orders.totalPaise})::int` })
    .from(schema.orders).where(and(paid, gte(schema.orders.paidAt, since(30)))).groupBy(schema.orders.venueId, schema.orders.channel);
  const bucket = (c: string) => (c === 'qr' ? 'qr' : c === 'zomato' || c === 'swiggy' || c === 'other' ? 'apps' : 'counter');
  const sources = { qr: { orders: 0, sales: 0 }, counter: { orders: 0, sales: 0 }, apps: { orders: 0, sales: 0 } };
  for (const r of byChannel) { const b = sources[bucket(r.channel)]; b.orders += r.orders; b.sales += r.sales || 0; }
  // Live venues that bill a lot themselves but get few guest QR orders: our commission is at risk.
  const lowQr = venues.flatMap(v => {
    const vd = vendors.find(x => x.id === v.vendorId);
    if (vd?.stage !== 'live' || vd.status !== 'active') return [];
    const rows = byChannel.filter(r => r.venueId === v.id);
    const all = rows.reduce((a, r) => a + r.orders, 0), qr = rows.filter(r => r.channel === 'qr').reduce((a, r) => a + r.orders, 0);
    return all >= 20 && qr / all < 0.25 ? [{ venueId: v.id, share: Math.round((qr / all) * 100), orders: all }] : [];
  });

  const venueName = (id: string) => { const v = venues.find(x => x.id === id); const vd = vendors.find(x => x.id === v?.vendorId); return { venue: v?.name ?? '', vendor: vd?.name ?? '', vendorId: vd?.id ?? '' }; };
  return {
    kpi: {
      today: t, week: w, month: m,
      vendors: { total: vendors.length, live: vendors.filter(v => v.stage === 'live' && v.status === 'active').length, setup: vendors.filter(v => v.stage === 'setup' && v.status === 'active').length, suspended: vendors.filter(v => v.status === 'suspended').length },
      venues: venues.length, customers: customers.n, newCustomers: customers.recent,
      monthDue, unpaidEarlier: unpaid,
    },
    days, sources,
    top: top.map(r => ({ ...r, ...venueName(r.venueId) })),
    attention: {
      followUps: followUps.map(l => ({ id: l.id, business: l.business, stage: l.stage, nextFollowUp: l.nextFollowUp, phone: l.phone })),
      setup: vendors.filter(v => v.stage === 'setup' && v.status === 'active').map(v => ({ id: v.id, name: v.name, since: v.createdAt })),
      quiet: quiet.map(v => ({ venueId: v.id, ...venueName(v.id) })),
      tickets: oldTickets.map(r => ({ id: r.t.id, topic: r.t.topic, venue: r.venue ?? '', createdAt: r.t.createdAt })),
      trialsEnding: trialsEnding.map(v => ({ id: v.id, name: v.name, trialEndsAt: v.trialEndsAt })),
      suspended: vendors.filter(v => v.status === 'suspended').map(v => ({ id: v.id, name: v.name })),
      lowQr: lowQr.map(l => ({ ...l, ...venueName(l.venueId) })),
    },
  };
});


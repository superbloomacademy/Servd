import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { brandVars } from '@/lib/theme';
import { ArrowRight, Clapperboard, Coffee, Store, UtensilsCrossed, ShieldCheck, ChefHat } from 'lucide-react';



const TYPE = {
  theater: { icon: Clapperboard, label: 'Theater · seat delivery', how: 'Order from your seat, delivered now or at the interval.' },
  restaurant: { icon: UtensilsCrossed, label: 'Restaurant · running bill', how: 'Order in rounds from your table, pay once at the end.' },
  cafe: { icon: Coffee, label: 'Café · table service, pay first', how: 'Pay to the café’s UPI, staff serve it to your table.' },
  stall: { icon: Store, label: 'Food stall · one shop QR', how: 'Order, pay the stall’s UPI, collect with your KOT number.' },
} as const;

const LOGINS = [
  ['Super admin (us)', '9000000000'], ['Aurora Cinemas owner', '9000000001'], ['Aurora cashier', '9000000011'], ['Aurora popcorn station', '9000000012'],
  ['Aurora runner', '9000000014'], ['Spice Route owner', '9000000002'], ['Spice Route captain', '9000000021'], ['Spice Route kitchen', '9000000022'],
  ['Brew Bay owner', '9000000003'], ['Brew Bay coffee bar', '9000000031'], ['Chaat Corner owner', '9000000004'], ['Chaat Corner counter', '9000000041'],
];

// Demo-mode home page (this PC only): opens each demo venue as a QR scan would, and lists the demo logins.
// Never shown on the live site: it links with secret QR codes.
export async function DemoHome() {
  const venues = await db().select({ venue: schema.venues, vendor: schema.vendors }).from(schema.venues)
    .innerJoin(schema.vendors, eq(schema.venues.vendorId, schema.vendors.id)).orderBy(asc(schema.vendors.createdAt));
  const demos = await Promise.all(venues.map(async v => {
    const spots = await db().select().from(schema.spots).where(eq(schema.spots.venueId, v.venue.id)).orderBy(asc(schema.spots.sort)).limit(400);
    const pick = v.venue.type === 'theater' ? spots.find(s => s.label === 'F7') : spots.find(s => s.label === '4') || spots[0];
    return { ...v, spot: pick ?? spots[0] };
  }));

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
      <header className="flex items-center justify-between py-6">
        <div className="text-2xl font-extrabold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>servd<span className="text-[#E23744]">.</span></div>
        <div className="flex gap-2 text-sm">
          <Link href="/staff/login" className="rounded-xl border border-line px-3.5 py-2 font-semibold hover:bg-soft">Staff login</Link>
          <Link href="/account" className="rounded-xl bg-ink px-3.5 py-2 font-semibold text-white">My orders</Link>
        </div>
      </header>

      <section className="py-6">
        <h1 className="max-w-2xl text-3xl font-extrabold leading-tight sm:text-4xl">Scan the QR at your seat or table. Order. Get it served.</h1>
        <p className="mt-3 max-w-xl text-muted">One platform for theaters, restaurants, cafés and food stalls. Each venue gets its own brand, menu, kitchen tickets and staff logins.</p>
      </section>

      <h2 className="mt-4 mb-3 text-lg font-bold">Try a demo venue <span className="font-normal text-muted">(opens exactly what a customer sees after scanning)</span></h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {demos.map(({ venue, vendor, spot }) => {
          const T = TYPE[venue.type];
          return (
            <Link key={venue.id} href={spot ? `/q/${spot.code}` : '#'} style={brandVars(vendor.brandColor)}
              className="group flex items-center gap-4 rounded-2xl border border-line p-4 transition hover:border-brand-line hover:shadow-sm">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand text-brand-ink"><T.icon size={22} /></div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-brand-text">{T.label}</div>
                <div className="truncate font-bold">{venue.name}</div>
                <div className="text-sm text-muted">{T.how}{spot ? ` Opens ${spot.kind === 'seat' ? 'seat' : spot.kind === 'table' ? 'table' : ''} ${spot.kind === 'shop' ? 'the shop QR' : spot.label}.` : ''}</div>
              </div>
              <ArrowRight size={18} className="text-faint transition group-hover:translate-x-0.5 group-hover:text-brand-text" />
            </Link>
          );
        })}
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-line p-5">
          <h2 className="flex items-center gap-2 font-bold"><ChefHat size={18} /> Demo staff logins <span className="font-normal text-muted">· PIN 1234 for all</span></h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {LOGINS.map(([who, phone]) => (
                  <tr key={phone} className="border-t border-line first:border-0"><td className="py-2 pr-4">{who}</td><td className="tabular py-2 font-mono text-ink-2">{phone}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link href="/staff/login" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#C81E2E]">Open staff login <ArrowRight size={15} /></Link>
        </section>
        <section className="rounded-2xl bg-soft p-5 text-sm leading-relaxed text-ink-2">
          <h2 className="flex items-center gap-2 font-bold text-ink"><ShieldCheck size={18} /> Testing notes</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>Customers log in with their mobile number; the OTP goes to their email. Until an email service is set up (testing mode) the OTP is also shown on screen.</li>
            <li>Payments go to the venue’s own UPI. Staff confirm them in the app. No payment gateway yet.</li>
            <li>Demo venues are open 24 hours and the theater runs a show every 3 hours, so ordering always works while testing.</li>
            <li>Open the customer page on your phone and the staff screens on the laptop to see orders arrive live.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}

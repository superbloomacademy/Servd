import Link from 'next/link';
import { ArrowRight, Banknote, ChefHat, Clapperboard, Coffee, LayoutDashboard, MessageCircle, QrCode, ReceiptText, ScanLine, Smartphone, Store, UtensilsCrossed, Mail } from 'lucide-react';
import { isDemo } from '@/lib/mode';
import { DemoHome } from '@/components/demo-home';

export const dynamic = 'force-dynamic';

// The address customers and venue owners land on. On the live site there is no venue list:
// customers get to a menu only by scanning the QR at their seat, table or counter.
export default async function Home() {
  if (isDemo()) return <DemoHome />;
  const phone = (process.env.PLATFORM_CONTACT_PHONE || '').replace(/\D/g, '').slice(-10);
  const email = process.env.PLATFORM_CONTACT_EMAIL || '';
  const wa = phone ? `https://wa.me/91${phone}?text=${encodeURIComponent('Hi! I’d like to know more about Servd for my venue.')}` : '';

  return (
    <div className="min-h-dvh bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="text-[26px] leading-none font-extrabold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>servd<span className="text-[#E23744]">.</span></div>
        <nav className="flex items-center gap-2 text-sm">
          <a href="#venues" className="hidden rounded-xl px-3 py-2 font-semibold text-ink-2 hover:bg-soft sm:block">For venues</a>
          <Link href="/account" className="rounded-xl bg-ink px-4 py-2.5 font-semibold text-white hover:bg-black">My orders</Link>
        </nav>
      </header>

      {/* Customers */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-6 pb-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-14">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-[#FDECEE] px-3 py-1 text-[13px] font-semibold text-[#B42334]"><ScanLine size={15} />No app to install</p>
          <h1 className="mt-4 text-4xl leading-[1.08] font-extrabold sm:text-5xl">Order from your seat or table. <span className="text-[#E23744]">We bring it to you.</span></h1>
          <p className="mt-4 max-w-lg text-[17px] text-muted">At theaters, restaurants, cafés and food stalls: scan the QR code where you’re sitting, pick what you like, pay by UPI, and follow your order live.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/account" className="inline-flex items-center gap-2 rounded-xl bg-[#E23744] px-5 py-3.5 font-bold text-white hover:brightness-95">Track my orders<ArrowRight size={18} /></Link>
            <a href="#how" className="inline-flex items-center gap-2 rounded-xl border border-line px-5 py-3.5 font-semibold hover:bg-soft">How it works</a>
          </div>
          <p className="mt-4 text-sm text-muted">Looking for the menu? Scan the QR code at your seat, table or counter.</p>
        </div>
        <div className="relative mx-auto w-full max-w-sm">
          <div className="rounded-[28px] border border-line bg-soft p-5 shadow-[0_20px_60px_rgba(0,0,0,0.08)]">
            <div className="rounded-2xl bg-white p-5 text-center">
              <p className="text-xs font-bold tracking-[0.18em] text-muted uppercase">Your KOT number</p>
              <p className="tabular mt-1 text-6xl font-extrabold">42</p>
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#E7F6EF] px-3 py-1 text-sm font-semibold text-[#11734E]"><ChefHat size={15} />Being prepared</p>
              <div className="mt-5 flex justify-between text-xs font-semibold text-muted">
                {['Paid', 'Preparing', 'Ready', 'Served'].map((s, i) => <span key={s} className={i < 2 ? 'text-ink' : ''}>{s}</span>)}
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-soft"><div className="h-full w-[45%] rounded-full bg-[#E23744]" /></div>
            </div>
            <div className="mt-3 space-y-2 rounded-2xl bg-white p-4 text-sm">
              {[['2 × Butter Popcorn', '₹360'], ['1 × Cold Coffee', '₹160']].map(([a, b]) => <div key={a} className="flex justify-between"><span>{a}</span><span className="tabular text-muted">{b}</span></div>)}
              <div className="flex justify-between border-t border-dashed border-line pt-2 font-bold"><span>Paid · UPI</span><span className="tabular">₹546</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-soft py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-3xl font-extrabold">How it works</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              [QrCode, 'Scan', 'Scan the QR code on your seat, table or the counter. The venue’s menu opens in your browser.'],
              [Smartphone, 'Order & pay', 'Add items, log in with your mobile number, and pay the venue directly by UPI (or cash, where allowed).'],
              [UtensilsCrossed, 'Get it served', 'Watch your order live. It comes to your seat or table, or you collect it with your KOT number.'],
            ].map(([I, t, d], i) => {
              const Icon = I as typeof QrCode;
              return (
                <div key={t as string} className="rounded-2xl bg-white p-6">
                  <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#FDECEE] text-[#E23744]"><Icon size={22} /></span><span className="text-sm font-bold text-muted">Step {i + 1}</span></div>
                  <h3 className="mt-4 text-xl font-bold">{t as string}</h3>
                  <p className="mt-1.5 text-muted">{d as string}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Venues */}
      <section id="venues" className="py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-bold tracking-wide text-[#E23744] uppercase">For venues</p>
            <h2 className="mt-2 text-3xl font-extrabold">More orders, shorter queues, happier guests.</h2>
            <p className="mt-3 text-muted">QR ordering in your own brand, with kitchen tickets, live order tracking and GST bills. Customers pay straight into your account.</p>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [Clapperboard, 'Theaters', 'Delivered to the seat, now or at the interval.'],
              [UtensilsCrossed, 'Restaurants', 'Order in rounds, one bill at the end.'],
              [Coffee, 'Cafés', 'Pay first and serve to the table, or an open bill.'],
              [Store, 'Food stalls', 'One QR, pay by UPI, collect with a KOT number.'],
            ].map(([I, t, d]) => {
              const Icon = I as typeof QrCode;
              return <div key={t as string} className="rounded-2xl border border-line p-5"><Icon size={22} className="text-[#E23744]" /><h3 className="mt-3 font-bold">{t as string}</h3><p className="mt-1 text-sm text-muted">{d as string}</p></div>;
            })}
          </div>
          <div className="mt-6 grid gap-x-8 gap-y-4 rounded-2xl bg-soft p-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [ChefHat, 'Kitchen tickets per station, with automatic printing'],
              [Banknote, 'UPI straight to your bank, cash tracked separately'],
              [ReceiptText, 'Numbered GST bills and a monthly GST report'],
              [LayoutDashboard, 'Live dashboard: sales, best sellers, busy hours'],
            ].map(([I, t]) => { const Icon = I as typeof QrCode; return <p key={t as string} className="flex items-start gap-3 text-sm font-semibold"><Icon size={19} className="mt-0.5 shrink-0 text-ink-2" />{t as string}</p>; })}
          </div>
          {(wa || email) && (
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {wa && <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-[#128C4B] px-5 py-3.5 font-bold text-white hover:brightness-95"><MessageCircle size={18} />Talk to us on WhatsApp</a>}
              {email && <a href={`mailto:${email}`} className="inline-flex items-center gap-2 rounded-xl border border-line px-5 py-3.5 font-semibold hover:bg-soft"><Mail size={18} />{email}</a>}
            </div>
          )}
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted sm:px-6">
          <span>© {new Date().getFullYear()} Servd</span>
          <span className="flex gap-4"><Link href="/account" className="hover:text-ink">My orders</Link><Link href="/staff/login" className="hover:text-ink">Venue login</Link></span>
        </div>
      </footer>
    </div>
  );
}

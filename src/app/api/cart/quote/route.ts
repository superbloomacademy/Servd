import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { body, notFound, route } from '@/lib/api';
import { getCustomer } from '@/lib/auth';
import { boughtTogether, checkCoupon, computeTotals, couponSuggestions, mostOrdered, priceCart, roundsOff, type CartLine } from '@/lib/orders';

// Cart screen: live pricing, the best coupons ("Save ₹50 with …", "Add ₹80 more…") and "Complete your meal".
export const POST = route(async req => {
  const b = await body<{ venueId: string; lines: CartLine[]; couponCode?: string }>(req);
  const venue = (await db().select().from(schema.venues).where(eq(schema.venues.id, String(b.venueId))))[0];
  if (!venue) throw notFound('Venue not found');
  const customer = await getCustomer();
  let priced;
  try { priced = await priceCart(venue, b.lines || []); }
  catch (e) { return { error: (e as Error).message, soldOut: true }; }
  const ids = priced.lines.map(l => l.item.id);
  let coupon = null;
  if (b.couponCode) coupon = await checkCoupon(venue, b.couponCode, priced.subtotal, customer?.id ?? null);
  const discount = coupon && coupon.ok ? coupon.discount : 0;
  const { tax, roundOff, total } = computeTotals(priced.subtotal, discount, venue.taxBps, roundsOff(venue));
  const [together, popular, coupons] = await Promise.all([
    boughtTogether(venue.id, ids, 6), mostOrdered(venue.id, 10), couponSuggestions(venue, priced.subtotal, customer?.id ?? null),
  ]);
  const suggestIds = [...together.map(t => t.itemId), ...popular.map(p => p.itemId)].filter((x, i, a) => !ids.includes(x) && a.indexOf(x) === i).slice(0, 6);
  return {
    subtotalPaise: priced.subtotal, discountPaise: discount, taxPaise: tax, roundOffPaise: roundOff, totalPaise: total,
    coupon, coupons, completeYourMeal: suggestIds, taxBps: venue.taxBps,
  };
});

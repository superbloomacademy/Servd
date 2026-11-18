// Demo data: a super admin and four vendors, one per venue type, each with its own brand,
// menu, stations, staff logins, coupons and ~2 weeks of past orders (marked by note "[demo]").
// All demo staff log in with PIN 1234.
import { eq, sql } from 'drizzle-orm';
import { db, schema } from './index';
import { defaultSettings, type ServiceMode, type VenueType } from './schema';
import { hashPin, parseRows, randomCode } from '../lib/util';
import { issueForOrder } from '../lib/invoices';

type MenuSpec = Record<string, { station: string; items: [string, number, boolean, string, string[]?][] }>;

const PIN = hashPin('1234');

export async function seedIfEmpty() {
  // Live (production) setup: no demo data. Only our own super admin login, from ADMIN_PHONE / ADMIN_PIN in .env.
  if (process.env.SEED_DEMO === 'false') {
    const admins = await db().select({ n: sql<number>`count(*)::int` }).from(schema.staff).where(sql`role = 'super_admin'`);
    if (admins[0].n > 0) return;
    const phone = String(process.env.ADMIN_PHONE || '').replace(/\D/g, '').slice(-10);
    const pin = String(process.env.ADMIN_PIN || '');
    if (!/^[6-9]\d{9}$/.test(phone) || !/^\d{6}$/.test(pin) || /^(\d)\1+$|123456|654321/.test(pin)) {
      throw new Error('First start of a live database: set ADMIN_PHONE (10-digit mobile) and ADMIN_PIN (6 digits, not 123456 or 111111) in the environment.');
    }
    await db().insert(schema.staff).values({ name: process.env.ADMIN_NAME || 'Platform Admin', phone, pinHash: hashPin(pin), role: 'super_admin' });
    console.log(`  Created the super admin login for ${phone}.`);
    return;
  }
  const n = await db().select({ n: sql<number>`count(*)::int` }).from(schema.vendors);
  if (n[0].n > 0) return;
  console.log('  Adding demo vendors, menus and staff…');
  await db().insert(schema.staff).values({ name: 'Platform Admin', phone: '9000000000', pinHash: PIN, role: 'super_admin' });

  // ---------------- Theater
  await vendor({
    vendor: { name: 'Aurora Cinemas', slug: 'aurora', brandColor: '#6D28D9', legalName: 'Aurora Cinemas Pvt Ltd', gstin: '36AABCA1234F1Z5', fssai: '13623001000123', address: 'Kukatpally, Hyderabad', commissionBps: 300 },
    venue: { name: 'Aurora Cinemas, Kukatpally', slug: 'aurora-kukatpally', type: 'theater', serviceMode: 'seat_delivery', city: 'Hyderabad', upiId: 'auroracinemas@okaxis', upiName: 'Aurora Cinemas' },
    ownerPhone: '9000000001',
    staff: [['Ravi (Cashier)', '9000000011', 'cashier'], ['Popcorn counter', '9000000012', 'station', 'Popcorn & Drinks'], ['Hot kitchen', '9000000013', 'station', 'Hot Kitchen'], ['Suresh (Runner)', '9000000014', 'runner']],
    theater: [
      { name: 'Screen 1', rows: 'A-J', seats: 14, movies: ['The Last Monsoon', 'Night Express'] },
      { name: 'Screen 2', rows: 'A-H', seats: 12, movies: ['Kite Runners', 'Galaxy Heist'] },
    ],
    menu: {
      Popcorn: { station: 'Popcorn & Drinks', items: [
        ['Salted Popcorn (Regular)', 180, true, 'Classic butter-salted, freshly popped', ['bestseller']],
        ['Salted Popcorn (Large)', 260, true, 'Large tub, good for two'],
        ['Caramel Popcorn', 240, true, 'Crunchy caramel glaze', ['must_try']],
        ['Cheese Popcorn', 260, true, 'Cheddar-dusted'],
      ] },
      Snacks: { station: 'Hot Kitchen', items: [
        ['Nachos with Salsa', 220, true, 'Corn chips, salsa and cheese dip', ['bestseller']],
        ['Veg Puff', 90, true, 'Flaky puff with spiced vegetables'],
        ['Chicken Puff', 120, false, 'Flaky puff with spiced chicken'],
        ['Peri Peri Fries', 160, true, 'Crisp fries, peri peri dust', ['spicy']],
        ['Chicken Nuggets (6 pcs)', 210, false, 'With mayo dip'],
      ] },
      Beverages: { station: 'Popcorn & Drinks', items: [
        ['Cola (500 ml)', 120, true, 'Chilled', ['bestseller']],
        ['Cold Coffee', 180, true, 'Blended with ice cream'],
        ['Mineral Water (1 L)', 40, true, ''],
      ] },
      Combos: { station: 'Popcorn & Drinks', items: [
        ['Solo Combo', 280, true, 'Regular popcorn + cola', ['bestseller']],
        ['Couple Combo', 520, true, '2 regular popcorn + 2 cola'],
      ] },
    },
    coupons: [['FIRST50', 'flat', 5000, 0, 20000, 1, '₹50 off your first order above ₹200'], ['COMBO10', 'percent', 10, 10000, 50000, 0, '10% off above ₹500, up to ₹100']],
  });

  // ---------------- Restaurant (running bill, pay at end)
  await vendor({
    vendor: { name: 'Spice Route Kitchen', slug: 'spice-route', brandColor: '#C2410C', legalName: 'Spice Route Foods LLP', gstin: '36AAKFS5678G1Z2', fssai: '13623001000456', address: 'Jubilee Hills, Hyderabad', commissionBps: 200 },
    venue: { name: 'Spice Route Kitchen, Jubilee Hills', slug: 'spice-route-jh', type: 'restaurant', serviceMode: 'table_bill', city: 'Hyderabad', upiId: 'spiceroute@okicici', upiName: 'Spice Route Kitchen' },
    ownerPhone: '9000000002',
    staff: [['Anil (Captain)', '9000000021', 'captain'], ['Main kitchen', '9000000022', 'station', 'Kitchen'], ['Tandoor', '9000000023', 'station', 'Tandoor'], ['Meena (Cashier)', '9000000024', 'cashier']],
    tables: [{ name: 'Ground floor', labels: ['1', '2', '3', '4', '5', '6', '7', '8'] }, { name: 'Terrace', labels: ['T1', 'T2', 'T3', 'T4'] }],
    menu: {
      Starters: { station: 'Tandoor', items: [
        ['Paneer Tikka', 320, true, 'Char-grilled cottage cheese, mint chutney', ['bestseller']],
        ['Chicken 65', 360, false, 'Hyderabadi style, curry leaves', ['spicy', 'bestseller']],
        ['Tandoori Chicken (Half)', 420, false, 'Smoky, yogurt marinade'],
        ['Crispy Corn', 260, true, 'Pepper, salt, spring onion'],
      ] },
      'Main Course': { station: 'Kitchen', items: [
        ['Butter Chicken', 440, false, 'Creamy tomato gravy', ['must_try']],
        ['Dal Makhani', 300, true, 'Slow-cooked black lentils'],
        ['Kadai Paneer', 360, true, 'Peppers, onion, kadai masala'],
        ['Chicken Dum Biryani', 380, false, 'Hyderabadi dum, raita, salan', ['bestseller']],
        ['Veg Biryani', 300, true, 'Basmati, vegetables, saffron'],
      ] },
      Breads: { station: 'Tandoor', items: [
        ['Butter Naan', 70, true, ''], ['Garlic Naan', 90, true, '', ['bestseller']], ['Tandoori Roti', 40, true, ''],
      ] },
      Desserts: { station: 'Kitchen', items: [['Double Ka Meetha', 180, true, 'Hyderabadi bread pudding'], ['Gulab Jamun (2)', 120, true, '']] },
      Beverages: { station: 'Kitchen', items: [['Sweet Lassi', 120, true, ''], ['Fresh Lime Soda', 100, true, ''], ['Masala Chaas', 80, true, '']] },
    },
    coupons: [['WELCOME100', 'flat', 10000, 0, 100000, 1, '₹100 off on bills above ₹1,000']],
  });

  // ---------------- Café (table service, pay first)
  await vendor({
    vendor: { name: 'Brew Bay Café', slug: 'brew-bay', brandColor: '#0F766E', legalName: 'Brew Bay Hospitality', gstin: '36AAHFB9012K1Z8', fssai: '13623001000789', address: 'Gachibowli, Hyderabad', commissionBps: 250 },
    venue: { name: 'Brew Bay Café, Gachibowli', slug: 'brew-bay-gachibowli', type: 'cafe', serviceMode: 'table_prepay', city: 'Hyderabad', upiId: 'brewbay@okhdfc', upiName: 'Brew Bay Cafe' },
    ownerPhone: '9000000003',
    staff: [['Coffee bar', '9000000031', 'station', 'Coffee Bar'], ['Café kitchen', '9000000033', 'station', 'Kitchen'], ['Priya (Counter)', '9000000032', 'cashier']],
    tables: [{ name: 'Indoor', labels: ['1', '2', '3', '4', '5', '6'] }, { name: 'Window', labels: ['W1', 'W2'] }],
    menu: {
      Coffee: { station: 'Coffee Bar', items: [
        ['Cappuccino', 180, true, 'Double shot, steamed milk', ['bestseller']], ['Café Latte', 190, true, ''],
        ['Iced Americano', 170, true, ''], ['Hazelnut Cold Brew', 240, true, '18-hour brew', ['must_try']],
      ] },
      'Tea & Shakes': { station: 'Coffee Bar', items: [['Masala Chai', 90, true, ''], ['Oreo Shake', 220, true, '', ['bestseller']], ['Mango Smoothie', 210, true, '', ['new']]] },
      Bites: { station: 'Kitchen', items: [
        ['Chicken Club Sandwich', 260, false, 'Triple-decker, fries'], ['Pesto Paneer Sandwich', 230, true, '', ['bestseller']],
        ['Masala Fries', 150, true, '', ['spicy']], ['Garlic Bread', 160, true, ''],
      ] },
      Desserts: { station: 'Coffee Bar', items: [['Chocolate Brownie', 150, true, 'Warm, with ice cream on request'], ['Blueberry Cheesecake', 240, true, '']] },
    },
    coupons: [['BREW20', 'percent', 20, 8000, 40000, 0, '20% off above ₹400, up to ₹80']],
  });

  // ---------------- Food stall (single shop QR, pay to stall UPI, KOT number)
  await vendor({
    vendor: { name: 'Chaat Corner', slug: 'chaat-corner', brandColor: '#B91C1C', legalName: 'Chaat Corner', fssai: '23623001000321', address: 'Inorbit Mall food court, Hyderabad', commissionBps: 200 },
    venue: { name: 'Chaat Corner, Inorbit Food Court', slug: 'chaat-corner-inorbit', type: 'stall', serviceMode: 'shop_qr', city: 'Hyderabad', upiId: 'chaatcorner@ybl', upiName: 'Chaat Corner' },
    ownerPhone: '9000000004',
    staff: [['Raju (Counter)', '9000000041', 'cashier']],
    shopCounter: true,
    menu: {
      Chaat: { station: 'Stall', items: [
        ['Pani Puri (6)', 60, true, '', ['bestseller']], ['Dahi Puri', 80, true, ''], ['Samosa Chaat', 90, true, '', ['bestseller']],
        ['Papdi Chaat', 80, true, ''], ['Bhel Puri', 70, true, ''],
      ] },
      'Pav & Rolls': { station: 'Stall', items: [['Pav Bhaji', 130, true, 'Extra butter', ['bestseller']], ['Vada Pav', 50, true, ''], ['Paneer Kathi Roll', 140, true, '']] },
      Drinks: { station: 'Stall', items: [['Masala Soda', 50, true, ''], ['Sweet Lassi', 70, true, '']] },
    },
    coupons: [],
  });

  // ---------------- Sales pipeline (super admin → Leads)
  const day = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + n * 864e5));
  await db().insert(schema.leads).values([
    { business: 'Sri Venkateswara Talkies', contactName: 'Mr. Rao', phone: '9848012345', city: 'Warangal', type: 'theater', stage: 'demo', source: 'Walk-in', notes: 'Single screen, 600 seats. Wants interval-only delivery.', nextFollowUp: day(1) },
    { business: 'Chai Point Corner', contactName: 'Sameer', phone: '9701122334', city: 'Hyderabad', type: 'stall', stage: 'contacted', source: 'Instagram', notes: 'Busy evenings, 2 staff.', nextFollowUp: day(0) },
    { business: 'The Biryani House', contactName: 'Farhan', phone: '9988776655', city: 'Hyderabad', type: 'restaurant', stage: 'trial', source: 'Referral', notes: '14 tables. Trial till month end.', nextFollowUp: day(3) },
    { business: 'Beanstalk Café', contactName: 'Nisha', phone: '9123456780', city: 'Bengaluru', type: 'cafe', stage: 'new', source: 'Website', notes: '', nextFollowUp: null },
    { business: 'Galaxy Multiplex', contactName: 'Operations head', phone: '9000111222', city: 'Vijayawada', type: 'theater', stage: 'lost', source: 'Cold call', notes: 'Already has an in-house app.', nextFollowUp: null },
  ]);
}

type VendorSpec = {
  vendor: Partial<typeof schema.vendors.$inferInsert> & { name: string; slug: string };
  venue: { name: string; slug: string; type: VenueType; serviceMode: ServiceMode; city: string; upiId: string; upiName: string };
  ownerPhone: string;
  staff: [string, string, 'cashier' | 'station' | 'runner' | 'captain' | 'manager', string?][];
  theater?: { name: string; rows: string; seats: number; movies: string[] }[];
  tables?: { name: string; labels: string[] }[];
  shopCounter?: boolean;
  menu: MenuSpec;
  coupons: [string, 'flat' | 'percent', number, number, number, number, string][];
};

async function vendor(spec: VendorSpec) {
  const d = db();
  const [v] = await d.insert(schema.vendors).values({ stage: 'live', liveAt: new Date(Date.now() - 45 * 864e5), ...spec.vendor }).returning();
  const [venue] = await d.insert(schema.venues).values({
    ...spec.venue, vendorId: v.id, address: spec.vendor.address, openTime: '00:00', closeTime: '00:00', // demo: open 24 h
    settings: { ...defaultSettings, acceptCash: true },
  }).returning();

  const stationIds: Record<string, string> = {};
  for (const [i, name] of [...new Set(Object.values(spec.menu).map(c => c.station))].entries()) {
    const [st] = await d.insert(schema.stations).values({ venueId: venue.id, name, sort: i }).returning();
    stationIds[name] = st.id;
  }

  // Spots
  const spotIds: string[] = [];
  if (spec.theater) {
    for (const [i, s] of spec.theater.entries()) {
      const [area] = await d.insert(schema.areas).values({ venueId: venue.id, name: s.name, rows: s.rows, seatsPerRow: s.seats, sort: i }).returning();
      // Demo shows every 3 hours around the clock, so ordering always works while testing.
      await d.insert(schema.shows).values(Array.from({ length: 8 }, (_, k) => ({
        venueId: venue.id, areaId: area.id, movie: s.movies[k % s.movies.length],
        time: `${String(k * 3).padStart(2, '0')}:${i ? '15' : '00'}`, durationMin: 165, intervalAfterMin: 80,
      })));
      const vals = [];
      let sort = 0;
      for (const r of parseRows(s.rows)) for (let n = 1; n <= s.seats; n++) vals.push({ venueId: venue.id, areaId: area.id, label: `${r}${n}`, kind: 'seat' as const, code: randomCode(), sort: sort++ });
      const rows = await d.insert(schema.spots).values(vals).returning({ id: schema.spots.id });
      spotIds.push(...rows.map(r => r.id));
    }
  }
  for (const [i, t] of (spec.tables || []).entries()) {
    const [area] = await d.insert(schema.areas).values({ venueId: venue.id, name: t.name, sort: i }).returning();
    const rows = await d.insert(schema.spots).values(t.labels.map((l, k) => ({ venueId: venue.id, areaId: area.id, label: l, kind: 'table' as const, code: randomCode(), sort: k }))).returning({ id: schema.spots.id });
    spotIds.push(...rows.map(r => r.id));
  }
  if (spec.shopCounter) {
    const [area] = await d.insert(schema.areas).values({ venueId: venue.id, name: 'Counter' }).returning();
    const rows = await d.insert(schema.spots).values({ venueId: venue.id, areaId: area.id, label: 'Counter', kind: 'shop', code: randomCode() }).returning({ id: schema.spots.id });
    spotIds.push(...rows.map(r => r.id));
  }

  // Menu
  const itemRows: (typeof schema.items.$inferSelect)[] = [];
  for (const [ci, [cat, c]] of Object.entries(spec.menu).entries()) {
    const [category] = await d.insert(schema.categories).values({ venueId: venue.id, name: cat, sort: ci }).returning();
    const rows = await d.insert(schema.items).values(c.items.map(([name, price, veg, description, tags], k) => ({
      venueId: venue.id, categoryId: category.id, stationId: stationIds[c.station], name, pricePaise: price * 100, veg, description, tags: tags || [], sort: k,
    }))).returning();
    itemRows.push(...rows);
  }

  // Staff
  await d.insert(schema.staff).values({ name: `${v.name} Owner`, phone: spec.ownerPhone, pinHash: PIN, role: 'owner', vendorId: v.id });
  for (const [name, phone, role, station] of spec.staff) {
    await d.insert(schema.staff).values({ name, phone, pinHash: PIN, role, vendorId: v.id, venueId: venue.id, stationId: station ? stationIds[station] : null });
  }

  for (const [code, type, value, maxD, minO, perC, description] of spec.coupons) {
    await d.insert(schema.coupons).values({ vendorId: v.id, code, type, value, maxDiscountPaise: maxD, minOrderPaise: minO, perCustomer: perC, description });
  }

  await demoExtras(venue, itemRows);
  await sampleOrders(venue, spotIds, itemRows);
}

// Demo of sizes, add-ons, round-off and inventory, so the POS features are visible straight away.
async function demoExtras(venue: typeof schema.venues.$inferSelect, itemRows: (typeof schema.items.$inferSelect)[]) {
  const d = db();
  const item = (n: string) => itemRows.find(i => i.name === n);
  const setOpts = async (n: string, variants: schema.ItemVariant[], addonGroups: schema.AddonGroup[] = []) => {
    const it = item(n);
    if (!it) return null;
    const price = variants.length ? Math.min(...variants.map(v => v.pricePaise)) : it.pricePaise;
    await d.update(schema.items).set({ variants, addonGroups, pricePaise: price }).where(eq(schema.items.id, it.id));
    return it;
  };
  const mats = async (list: [string, string, number, number, number][]) => {
    const out: Record<string, string> = {};
    for (const [name, unit, qty, low, cost] of list) {
      const [m] = await d.insert(schema.stockItems).values({ venueId: venue.id, name, unit, qty, lowLevel: low, costPaise: cost * 100 }).returning();
      await d.insert(schema.stockMoves).values({ venueId: venue.id, stockItemId: m.id, kind: 'adjust', qty, note: 'Opening stock', staffName: 'Setup' });
      out[name] = m.id;
    }
    return out;
  };
  const recipe = async (itemName: string, variantId: string | null, lines: [string, number][], m: Record<string, string>) => {
    const it = item(itemName);
    if (it) await d.insert(schema.recipes).values(lines.map(([mat, qty]) => ({ venueId: venue.id, itemId: it.id, variantId, stockItemId: m[mat], qty })));
  };

  if (venue.serviceMode === 'table_bill') {
    await d.update(schema.venues).set({ settings: { ...venue.settings, roundOff: true } }).where(eq(schema.venues.id, venue.id));
    await setOpts('Chicken Dum Biryani', [{ id: 'half', name: 'Half', pricePaise: 26000 }, { id: 'full', name: 'Full', pricePaise: 38000 }],
      [{ id: 'extras', name: 'Extras', min: 0, max: 2, options: [{ id: 'egg', name: 'Boiled egg', pricePaise: 2000, veg: false }, { id: 'raita', name: 'Extra raita', pricePaise: 3000, veg: true }] }]);
    await setOpts('Butter Chicken', [], [{ id: 'bread', name: 'Add bread', min: 0, max: 2, options: [{ id: 'bnaan', name: 'Butter Naan', pricePaise: 7000, veg: true }, { id: 'gnaan', name: 'Garlic Naan', pricePaise: 9000, veg: true }] }]);
    const m = await mats([['Paneer', 'kg', 8, 2, 380], ['Chicken', 'kg', 12, 3, 260], ['Basmati rice', 'kg', 20, 5, 120], ['Butter', 'kg', 3, 1, 520]]);
    await recipe('Paneer Tikka', null, [['Paneer', 0.2]], m);
    await recipe('Kadai Paneer', null, [['Paneer', 0.18], ['Butter', 0.02]], m);
    await recipe('Butter Chicken', null, [['Chicken', 0.25], ['Butter', 0.03]], m);
    await recipe('Chicken 65', null, [['Chicken', 0.22]], m);
    await recipe('Chicken Dum Biryani', 'half', [['Chicken', 0.15], ['Basmati rice', 0.12]], m);
    await recipe('Chicken Dum Biryani', 'full', [['Chicken', 0.25], ['Basmati rice', 0.2]], m);
  }
  if (venue.type === 'cafe') {
    await setOpts('Cappuccino', [{ id: 'reg', name: 'Regular', pricePaise: 18000 }, { id: 'lg', name: 'Large', pricePaise: 22000 }],
      [{ id: 'extras', name: 'Make it special', min: 0, max: 2, options: [{ id: 'shot', name: 'Extra shot', pricePaise: 4000, veg: true }, { id: 'oat', name: 'Oat milk', pricePaise: 5000, veg: true }, { id: 'hazel', name: 'Hazelnut syrup', pricePaise: 3000, veg: true }] }]);
    const m = await mats([['Coffee beans', 'kg', 4, 1, 1400], ['Milk', 'l', 15, 5, 60]]);
    await recipe('Cappuccino', 'reg', [['Coffee beans', 0.018], ['Milk', 0.15]], m);
    await recipe('Cappuccino', 'lg', [['Coffee beans', 0.025], ['Milk', 0.22]], m);
    await recipe('Café Latte', null, [['Coffee beans', 0.018], ['Milk', 0.2]], m);
  }
}


// Two weeks of delivered orders so dashboards and "Most ordered" have real numbers.
async function sampleOrders(venue: typeof schema.venues.$inferSelect, spotIds: string[], itemRows: (typeof schema.items.$inferSelect)[]) {
  const d = db();
  const names = ['Ravi', 'Priya', 'Arjun', 'Sneha', 'Kiran', 'Meera', 'Vikram', 'Anjali', 'Rahul', 'Divya', 'Naveen', 'Pooja'];
  const custIds: string[] = [];
  for (const [i, name] of names.entries()) {
    const phone = '81' + String(10000000 + i * 7919 + venue.name.length * 101).slice(-8);
    const r = await d.insert(schema.customers).values({ phone, name }).onConflictDoNothing().returning({ id: schema.customers.id });
    if (r[0]) custIds.push(r[0].id);
    else custIds.push((await d.select({ id: schema.customers.id }).from(schema.customers).where(sql`phone = ${phone}`))[0].id);
  }
  // Popular items are picked more often; some items pair naturally (popcorn + cola).
  const weighted = itemRows.flatMap(it => Array(it.tags.includes('bestseller') ? 6 : it.tags.includes('must_try') ? 3 : 1).fill(it));
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  const counters: Record<string, number> = {};
  const per = venue.type === 'stall' ? 14 : venue.type === 'restaurant' ? 8 : 10;

  for (let day = 13; day >= 0; day--) {
    for (let k = 0; k < per + Math.floor(Math.random() * 6); k++) {
      const created = new Date(Date.now() - day * 864e5 - Math.random() * 10 * 3600e3);
      if (created > new Date(Date.now() - 20 * 60e3)) continue;
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(created);
      counters[date] = (counters[date] || 0) + 1;
      const lines = new Map<string, { it: typeof itemRows[number]; qty: number }>();
      const count = 1 + Math.floor(Math.random() * 3);
      for (let j = 0; j < count; j++) {
        const it = pick(weighted);
        lines.set(it.id, { it, qty: (lines.get(it.id)?.qty || 0) + 1 });
        // natural pairing
        const pair = itemRows.find(x => (it.name.includes('Popcorn') && x.name.startsWith('Cola')) || (it.name.includes('Biryani') && x.name.includes('Lassi')) || (it.name.includes('Naan') && x.name === 'Butter Chicken') || (it.name.includes('Sandwich') && x.name === 'Cappuccino') || (it.name === 'Pani Puri (6)' && x.name === 'Masala Soda'));
        if (pair && Math.random() < 0.6) lines.set(pair.id, { it: pair, qty: (lines.get(pair.id)?.qty || 0) + 1 });
      }
      const subtotal = [...lines.values()].reduce((s, l) => s + l.it.pricePaise * l.qty, 0);
      const tax = Math.round(subtotal * venue.taxBps / 10000);
      const cash = Math.random() < (venue.type === 'stall' ? 0.35 : 0.2);
      const payMethod = venue.serviceMode === 'table_bill' ? (cash ? 'cash' : 'upi_shop') : cash ? 'cash' : 'upi_shop';
      const done = new Date(created.getTime() + (8 + Math.random() * 12) * 60e3);
      const [o] = await d.insert(schema.orders).values({
        venueId: venue.id, vendorId: venue.vendorId, customerId: pick(custIds), spotId: pick(spotIds), kotNo: counters[date], businessDate: date,
        status: 'delivered', payStatus: 'paid', payMethod: payMethod as 'cash' | 'upi_shop', paidAt: created,
        fulfilment: venue.serviceMode === 'seat_delivery' ? 'seat' : venue.serviceMode.startsWith('table') ? 'table' : 'pickup',
        spotLabel: 'Demo', subtotalPaise: subtotal, taxPaise: tax, totalPaise: subtotal + tax, note: '[demo]',
        timeline: [{ status: 'confirmed', at: created.toISOString() }, { status: 'ready', at: new Date(done.getTime() - 120e3).toISOString() }, { status: 'delivered', at: done.toISOString() }],
        createdAt: created,
      }).returning();
      await d.insert(schema.orderItems).values([...lines.values()].map(l => ({ orderId: o.id, itemId: l.it.id, stationId: l.it.stationId, name: l.it.name, pricePaise: l.it.pricePaise, qty: l.qty, veg: l.it.veg })));
      await d.insert(schema.kots).values({ orderId: o.id, venueId: venue.id, stationName: 'Kitchen', status: 'ready', createdAt: created, startedAt: created, readyAt: done });
    }
  }
  // GST bills for the demo orders, numbered in the order they were paid.
  const paid = await d.select({ id: schema.orders.id, paidAt: schema.orders.paidAt }).from(schema.orders).where(sql`venue_id = ${venue.id}`).orderBy(schema.orders.paidAt);
  for (const p of paid) await issueForOrder(p.id, p.paidAt ?? new Date());
  // Keep today's KOT counter in step with the demo orders.
  for (const [date, last] of Object.entries(counters)) {
    await d.insert(schema.dailyCounters).values({ venueId: venue.id, date, kind: 'kot', last }).onConflictDoNothing();
  }
}

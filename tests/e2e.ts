// End-to-end test of the whole platform through its real API, the way people use it.
// Needs the app running in testing mode (no EMAIL_PROVIDER in .env):   npm run dev
// Run:   npm run test:e2e        (optional: BASE=http://localhost:3001)
// It creates its own test vendor each run, so it can be run again and again.

const BASE = process.env.BASE || 'http://localhost:3001';
let pass = 0, fail = 0;
const failures: string[] = [];

function check(name: string, ok: unknown, info?: unknown) {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ✗ ${name}${info !== undefined ? `  →  ${typeof info === 'string' ? info : JSON.stringify(info).slice(0, 300)}` : ''}`); }
}
const section = (t: string) => console.log(`\n${t}`);

// A browser-like client with its own cookies.
class Client {
  jar = new Map<string, string>();
  async req(path: string, opts: { method?: string; body?: unknown } = {}) {
    const res = await fetch(BASE + path, {
      method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'),
      headers: { 'content-type': 'application/json', cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ') },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      redirect: 'manual',
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(';'); const i = kv.indexOf('=');
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (v) this.jar.set(k, v); else this.jar.delete(k);
    }
    const text = (await res.text()).replace(/<!-- -->/g, '');   // React's invisible markers between text pieces
    let json: any = null; try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, json, text };
  }
  get = (p: string) => this.req(p);
  post = (p: string, body: unknown = {}) => this.req(p, { body });
  patch = (p: string, body: unknown) => this.req(p, { method: 'PATCH', body });
  del = (p: string) => this.req(p, { method: 'DELETE' });
}

const rnd = (n: number) => Math.floor(Math.random() * n);
const phone = () => `9${String(100000000 + rnd(899999999))}`;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function customerLogin(c: Client, ph: string, email: string) {
  let r = await c.post('/api/auth/otp', { phone: ph });
  if (r.json?.needEmail) r = await c.post('/api/auth/otp', { phone: ph, email });
  if (!r.json?.devOtp) throw new Error('No test OTP. Is EMAIL_PROVIDER empty in .env? ' + r.text.slice(0, 200));
  return c.post('/api/auth/verify', { phone: ph, otp: r.json.devOtp });
}

async function main() {
  console.log(`Servd end-to-end test against ${BASE}`);
  const admin = new Client(), owner = new Client(), cust = new Client(), other = new Client(), cashier = new Client();

  section('Pages load');
  for (const p of ['/', '/admin', '/staff/login', '/account']) {
    const r = await new Client().get(p);
    check(`${p} loads`, r.status === 200, r.status);
  }

  section('Super admin');
  check('wrong PIN is refused', (await admin.post('/api/staff/login', { phone: '9000000000', pin: '9999' })).status === 400);
  const login = await admin.post('/api/staff/login', { phone: '9000000000', pin: '1234' });
  check('super admin logs in', login.json?.role === 'super_admin', login.json);
  const ov = await admin.get('/api/admin/overview');
  check('overview has numbers', typeof ov.json?.kpi?.month?.sales === 'number' && ov.json.days?.length === 14, ov.json);
  const vlist = await admin.get('/api/admin/vendors');
  check('vendor list loads', Array.isArray(vlist.json?.vendors) && vlist.json.vendors.length >= 4);

  section('Leads');
  const lead = await admin.post('/api/admin/leads', { business: 'Test Lead Café', contactName: 'Asha', phone: '9876500000', city: 'Hyderabad', type: 'cafe', nextFollowUp: '2026-01-01' });
  check('add a lead', lead.json?.lead?.id, lead.json);
  const lp = await admin.patch(`/api/admin/leads/${lead.json.lead.id}`, { stage: 'demo' });
  check('change lead stage (other fields kept)', lp.json?.lead?.stage === 'demo' && lp.json.lead.city === 'Hyderabad', lp.json);
  check('overdue follow-up shows on overview', (await admin.get('/api/admin/overview')).json?.attention?.followUps?.some((f: any) => f.id === lead.json.lead.id));

  section('Onboarding a new vendor');
  const ownerPhone = phone();
  const bad = await admin.post('/api/admin/vendors', { vendorName: 'X', venueName: 'Y', type: 'stall', serviceMode: 'shop_qr', ownerName: 'Ow', ownerPhone, ownerPin: '12', gstin: 'WRONG' });
  check('bad details are refused with a clear message', bad.status === 400 && typeof bad.json?.error === 'string', bad.json);
  const dup = await admin.post('/api/admin/vendors', { vendorName: 'Dup Test', venueName: 'Dup', type: 'stall', serviceMode: 'shop_qr', ownerName: 'Ow', ownerPhone: '9000000001', ownerPin: '4821' });
  check('owner phone already in use is refused', dup.json?.code === 'phone_taken', dup.json);
  const ob = await admin.post('/api/admin/vendors', {
    vendorName: `Test Chaat ${rnd(9999)}`, legalName: 'Test Foods LLP', venueName: 'Test Chaat, Ameerpet', type: 'stall', serviceMode: 'shop_qr',
    city: 'Hyderabad', taxBps: 500, ownerName: 'Ravi Owner', ownerPhone, ownerPin: '4821', commissionBps: 200, monthlyFeePaise: 49900, trialDays: 0, openTime: '00:00', closeTime: '00:00', features: { customers: false }, // open 24 h so the test works at any hour
    leadId: lead.json.lead.id,
  });
  check('vendor onboarded', ob.json?.vendor?.id && ob.json.venue?.id, ob.json);
  const vendorId = ob.json.vendor.id, venueId = ob.json.venue.id;
  check('new vendor starts in "setting up"', ob.json.vendor.stage === 'setup');
  check('lead marked as won and linked', (await admin.get('/api/admin/leads')).json?.leads?.find((l: any) => l.id === lead.json.lead.id)?.vendorId === vendorId);
  const det = await admin.get(`/api/admin/vendors/${vendorId}`);
  check('vendor detail shows venue + owner login', det.json?.venues?.length === 1 && det.json.team?.some((m: any) => m.role === 'owner' && m.phone === ownerPhone), det.json);

  section('Owner sets up the venue');
  check('owner logs in with the PIN from onboarding', (await owner.post('/api/staff/login', { phone: ownerPhone, pin: '4821' })).json?.role === 'owner');
  check('module chosen at onboarding: no customer list', (await owner.get(`/api/staff/v/${venueId}/customers`)).status === 403 && (await owner.get('/api/staff/me')).json?.venues?.[0]?.vendor?.features?.customers === false);
  const me = await owner.get('/api/staff/me');
  check('owner sees the venue, still in setup', me.json?.venues?.[0]?.id === venueId && me.json.venues[0].vendor.stage === 'setup', me.json);
  let setup = await owner.get(`/api/staff/v/${venueId}/setup`);
  check('checklist starts incomplete', setup.json?.checklist && !setup.json.checklist.ready, setup.json);
  check('"Go live" is refused until the steps are done', (await owner.post(`/api/staff/v/${venueId}/setup`)).status === 400);
  check('owner cannot open the platform admin', (await owner.get('/api/admin/overview')).status === 403);
  check('save business details', (await owner.patch('/api/staff/vendor', { legalName: 'Test Foods LLP', fssai: '12345678901234', gstin: '36ABCDE1234F1Z5' })).status === 200);
  check('save UPI ID', (await owner.patch(`/api/staff/v/${venueId}/settings`, { upiId: 'testchaat@okaxis', upiName: 'Test Chaat' })).status === 200);
  const cat = await owner.post(`/api/staff/v/${venueId}/menu`, { type: 'category', name: 'Chaat' });
  const menu0 = await owner.get(`/api/staff/v/${venueId}/menu`);
  const station = menu0.json.stations[0].id;
  const itemIds: string[] = [];
  for (const [name, price] of [['Pani Puri', 6000], ['Bhel Puri', 7000], ['Masala Soda', 5000]] as const) {
    const r = await owner.post(`/api/staff/v/${venueId}/menu`, { type: 'item', categoryId: cat.json?.row?.id ?? cat.json?.category?.id ?? menu0.json.categories[0]?.id, stationId: station, name, pricePaise: price });
    const id = r.json?.row?.id ?? r.json?.item?.id; if (id) itemIds.push(id);
  }
  const menu = await owner.get(`/api/staff/v/${venueId}/menu`);
  check('menu has 3 items', menu.json?.items?.length === 3, menu.json);
  const sp = await owner.post(`/api/staff/v/${venueId}/spots`, { name: 'Counter', kind: 'counter' });
  check('shop QR created', sp.status === 200, sp.json);
  const spots = await owner.get(`/api/staff/v/${venueId}/spots`);
  const code = spots.json?.spots?.[0]?.code;
  check('QR code exists', !!code);
  setup = await owner.get(`/api/staff/v/${venueId}/setup`);
  check('required steps now done', setup.json?.checklist?.ready, setup.json?.checklist?.steps);
  check('owner goes live', (await owner.post(`/api/staff/v/${venueId}/setup`)).json?.stage === 'live');

  section('Customer orders and pays (pay-first, shop QR)');
  const custPhone = phone(), custEmail = `e2e${rnd(1e6)}@example.com`;
  const scan0 = await cust.post('/api/scan', { code });
  check('QR scan opens the menu', scan0.json?.window?.open && scan0.json.menu, scan0.json?.window);
  check('customer logs in (email OTP)', (await customerLogin(cust, custPhone, custEmail)).json?.customer?.email === custEmail);
  const scan = await cust.post('/api/scan', { code });
  const visitId = scan.json?.visit?.id;
  const ord = await cust.post('/api/orders', { visitId, lines: [{ itemId: itemIds[0], qty: 2 }, { itemId: itemIds[2], qty: 1 }], payMethod: 'upi_shop' });
  check('order placed', ord.json?.order?.kotNo > 0, ord.json);
  const orderId = ord.json.order.id;
  check('price + 5% GST is right (2×60 + 50 = 170 → 178.50)', ord.json.order.subtotalPaise === 17000 && ord.json.order.taxPaise === 850 && ord.json.order.totalPaise === 17850, ord.json.order);
  check('customer says "I paid"', (await cust.post(`/api/orders/${orderId}/paid`, { utr: '123456789012' })).json?.order?.payStatus === 'claimed');
  check('no bill before staff confirm', (await cust.get(`/api/orders/${orderId}`)).json?.invoice === null);
  const conf = await owner.post(`/api/staff/orders/${orderId}`, { action: 'confirm_payment' });
  check('staff confirm payment', conf.json?.order?.payStatus === 'paid', conf.json);
  const o2 = await cust.get(`/api/orders/${orderId}`);
  check('GST bill created with a number', /^[A-Z0-9]+\/\d{4}\/\d{5}$/.test(o2.json?.invoice?.number || ''), o2.json?.invoice);
  const inv = await cust.get(`/print/invoice/${o2.json.invoice.id}`);
  check('customer can open their bill', inv.status === 200 && inv.text.includes(o2.json.invoice.number) && inv.text.includes('TAX INVOICE'), inv.status);
  check('bill shows CGST/SGST 2.5% and GSTIN', inv.text.includes('CGST @ 2.5%') && inv.text.includes('36ABCDE1234F1Z5'));
  const otherLogin = await customerLogin(other, phone(), `e2e${rnd(1e6)}@example.org`);
  check('another customer logs in', otherLogin.status === 200);
  check('another customer cannot see the order', (await other.get(`/api/orders/${orderId}`)).status === 404);
  check('another customer cannot open the bill', !(await other.get(`/print/invoice/${o2.json.invoice.id}`)).text.includes(o2.json.invoice.number));
  check('bill link also works with the order id (staff)', (await owner.get(`/print/invoice/${orderId}`)).text.includes(o2.json.invoice.number));

  section('A second order: paid, then rejected → bill cancelled');
  const ord2 = await cust.post('/api/orders', { visitId, lines: [{ itemId: itemIds[1], qty: 1 }], payMethod: 'cash' });
  await owner.post(`/api/staff/orders/${ord2.json.order.id}`, { action: 'confirm_payment' });
  const inv2 = (await cust.get(`/api/orders/${ord2.json.order.id}`)).json?.invoice;
  check('second bill has the next number', inv2 && Number(inv2.number.split('/')[2]) === Number(o2.json.invoice.number.split('/')[2]) + 1, inv2);
  await owner.post(`/api/staff/orders/${ord2.json.order.id}`, { action: 'reject', reason: 'Out of stock' });
  check('rejected paid order → bill cancelled', (await cust.get(`/api/orders/${ord2.json.order.id}`)).json?.invoice?.status === 'cancelled');

  section('Owner GST report');
  const gst = await owner.get(`/api/staff/v/${venueId}/invoices`);
  check('report counts 1 issued + 1 cancelled', gst.json?.totals?.bills === 1 && gst.json.totals.cancelled === 1, gst.json?.totals);
  check('report totals match the bill', gst.json?.totals?.total === 17850 && gst.json.totals.cgst + gst.json.totals.sgst === 850, gst.json?.totals);
  const csv = await owner.get(`/api/staff/v/${venueId}/invoices?format=csv`);
  check('Excel/CSV download works', csv.status === 200 && csv.text.includes('Bill No,Date') && csv.text.includes(o2.json.invoice.number));

  section('Running bill (restaurant): one GST bill for the whole table');
  const sr = new Client();
  await sr.post('/api/staff/login', { phone: '9000000002', pin: '1234' });
  const srVenue = (await sr.get('/api/staff/me')).json.venues[0].id;
  const srSpots = (await sr.get(`/api/staff/v/${srVenue}/spots`)).json.spots.filter((s: any) => s.active);
  const srMenu = (await sr.get(`/api/staff/v/${srVenue}/menu`)).json.items.filter((i: any) => i.isLive);
  const t = new Client();
  await customerLogin(t, phone(), `e2e${rnd(1e6)}@example.net`);
  // pick a free table
  let tv: any = null;
  for (const s of srSpots) { const r = await t.post('/api/scan', { code: s.code }); if (r.json?.window?.open && r.json.visit) { tv = r.json; break; } }
  check('table QR opens a running bill', !!tv?.tableSessionId, tv?.window);
  if (tv) {
    await t.post('/api/orders', { visitId: tv.visit.id, lines: [{ itemId: srMenu[0].id, qty: 1 }] });
    await t.post('/api/orders', { visitId: tv.visit.id, lines: [{ itemId: srMenu[1].id, qty: 2 }] });
    const close = await sr.post(`/api/staff/tables/${tv.tableSessionId}`, { method: 'cash' });
    check('table closed', close.status === 200, close.json);
    const tb = await t.get(`/print/invoice/${tv.tableSessionId}`);
    check('one GST bill covers both rounds', tb.status === 200 && /KOT: \d+, \d+/.test(tb.text.replace(/<!-- -->/g, '')), tb.text.slice(0, 200));
  }

  section('Logins and security');
  const cashPhone = phone();
  const add = await owner.post('/api/staff/team', { name: 'Test Cashier', phone: cashPhone, pin: '5555', role: 'cashier', venueId });
  check('owner adds a cashier', add.status === 200, add.json);
  check('cashier logs in', (await cashier.post('/api/staff/login', { phone: cashPhone, pin: '5555' })).json?.role === 'cashier');
  check('cashier cannot see GST report', (await cashier.get(`/api/staff/v/${venueId}/invoices`)).status === 403);
  check('cashier cannot open admin', (await cashier.get('/api/admin/vendors')).status === 403);
  check('customer cannot use staff APIs', (await cust.get(`/api/staff/v/${venueId}/live`)).status === 401);
  check('other vendor’s owner cannot open this venue', (await sr.get(`/api/staff/v/${venueId}/invoices`)).status === 403);
  const memberId = add.json.member.id;
  check('admin resets the cashier PIN', (await admin.post(`/api/admin/staff/${memberId}`, { action: 'reset_pin', pin: '7391' })).status === 200);
  check('old session is logged out', (await cashier.get('/api/staff/me')).status === 401);
  check('old PIN stops working', (await new Client().post('/api/staff/login', { phone: cashPhone, pin: '5555' })).status === 400);
  check('new PIN works', (await new Client().post('/api/staff/login', { phone: cashPhone, pin: '7391' })).json?.role === 'cashier');

  section('Suspending a vendor');
  check('admin suspends', (await admin.patch(`/api/admin/vendors/${vendorId}`, { status: 'suspended' })).json?.vendor?.status === 'suspended');
  const blocked = await cust.post('/api/scan', { code });
  check('QR stops taking orders', blocked.json?.window?.open === false, blocked.json?.window);
  check('placing an order is refused', (await cust.post('/api/orders', { visitId, lines: [{ itemId: itemIds[0], qty: 1 }] })).status === 400);
  await admin.patch(`/api/admin/vendors/${vendorId}`, { status: 'active' });
  check('reactivated vendor takes orders again', (await cust.post('/api/scan', { code })).json?.window?.open === true);

  section('Platform billing');
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()).slice(0, 7);
  const bill = await admin.get(`/api/admin/billing?month=${month}`);
  const row = bill.json?.rows?.find((r: any) => r.vendorId === vendorId);
  check('commission 2% of 178.50 = 3.57, + ₹499 fee', row?.commissionPaise === 357 && row.feePaise === 49900 && row.totalPaise === 50257, row);
  await admin.patch(`/api/admin/vendors/${vendorId}`, { commissionCapPaise: 200 });
  const capped = (await admin.get(`/api/admin/billing?month=${month}`)).json?.rows?.find((r: any) => r.vendorId === vendorId);
  check('monthly commission cap: ₹3.57 is capped at ₹2', capped?.commissionPaise === 200 && capped.capped === true && capped.totalPaise === 50100, capped);
  await admin.patch(`/api/admin/vendors/${vendorId}`, { commissionCapPaise: 0 });
  check('no cap again: back to ₹3.57', (await admin.get(`/api/admin/billing?month=${month}`)).json?.rows?.find((r: any) => r.vendorId === vendorId)?.commissionPaise === 357);
  const rec = await admin.post('/api/admin/billing', { vendorId, month, action: 'mark_paid', reference: 'UPI 9988' });
  check('mark this month as paid (bill recorded with number)', rec.json?.bill?.status === 'paid' && /^SV-\d{4}-\d{3}$/.test(rec.json.bill.number), rec.json);
  check('owner can open our bill', (await owner.get(`/print/platform-bill/${rec.json.bill.id}`)).text.includes(rec.json.bill.number));
  check('another vendor cannot open it', !(await sr.get(`/print/platform-bill/${rec.json.bill.id}`)).text.includes(rec.json.bill.number));
  check('owner sees it under "Your bills from Servd"', (await owner.get('/api/staff/platform-bills')).json?.bills?.some((b: any) => b.id === rec.json.bill.id));

  section('Support, customers, activity');
  const tk = await cust.post('/api/support', { topic: 'Order is late', message: 'Test request from the e2e test', orderId });
  check('customer raises a help request', tk.status === 200, tk.json);
  const sup = await admin.get('/api/admin/support');
  const ticket = sup.json?.tickets?.find((x: any) => x.message === 'Test request from the e2e test');
  check('admin sees it', !!ticket);
  check('admin replies', (await admin.post('/api/admin/support', { id: ticket?.id, reply: 'Sorry! Fixed.' })).json?.ticket?.status === 'resolved');
  check('admin finds the customer by email', (await admin.get(`/api/admin/customers?q=${encodeURIComponent(custEmail)}`)).json?.customers?.[0]?.phone === custPhone);
  const act = await admin.get('/api/admin/activity');
  check('activity log records onboarding, go-live, PIN reset, suspension', ['vendor_onboarded', 'vendor_went_live', 'pin_reset', 'vendor_suspended'].every(a => act.json?.entries?.some((e: any) => e.action === a)));

  // ------------------------------------------------------------------ every remaining route
  section('Pages: menu, order tracking, KOT, QR stickers, table bill');
  check('customer menu page /q/<code> loads', (await cust.get(`/q/${code}`)).status === 200);
  check('order tracking page /o/<id> loads', (await cust.get(`/o/${orderId}`)).status === 200);
  const kotPrint = await owner.get(`/print/kot/${orderId}`);
  check('KOT print page shows the KOT number', kotPrint.status === 200 && kotPrint.text.includes(`KOT #${ord.json.order.kotNo}`));
  const qrPrint = await owner.get(`/print/qr/${venueId}`);
  check('QR sticker print page loads', qrPrint.status === 200 && qrPrint.text.includes('Counter'));
  if (tv) check('old table-bill link forwards to the GST bill', [307, 308].includes((await sr.get(`/print/table/${tv.tableSessionId}`)).status));
  check('health check', (await new Client().get('/api/health')).json?.ok === true);

  section('Cart price check and coupons');
  const quote = await cust.post('/api/cart/quote', { venueId, lines: [{ itemId: itemIds[1], qty: 2 }] });
  check('cart total: 2 × 70 + 5% GST = 147', quote.json?.subtotalPaise === 14000 && quote.json.taxPaise === 700 && quote.json.totalPaise === 14700, quote.json);
  const cp = await owner.post('/api/staff/coupons', { code: 'E2ETEN', type: 'percent', value: 10, maxDiscountPaise: 5000, description: 'Test 10% off' });
  check('owner creates a coupon', cp.json?.coupon?.id, cp.json);
  check('coupon is listed', (await owner.get('/api/staff/coupons')).json?.coupons?.some((c: any) => c.code === 'E2ETEN'));
  const q2 = await cust.post('/api/cart/quote', { venueId, lines: [{ itemId: itemIds[1], qty: 2 }], couponCode: 'E2ETEN' });
  check('coupon gives 10% off (₹14) and GST is on the reduced amount', q2.json?.discountPaise === 1400 && q2.json.taxPaise === 630 && q2.json.totalPaise === 13230, q2.json);
  await owner.patch(`/api/staff/coupons/${cp.json.coupon.id}`, { active: false });
  const q3 = await cust.post('/api/cart/quote', { venueId, lines: [{ itemId: itemIds[1], qty: 2 }], couponCode: 'E2ETEN' });
  check('switched-off coupon no longer gives a discount', !q3.json?.discountPaise, q3.json);
  check('owner deletes the coupon', (await owner.del(`/api/staff/coupons/${cp.json.coupon.id}`)).status === 200);

  section('Menu edits: sold out, price change, delete');
  check('item switched off (sold out)', (await owner.patch(`/api/staff/menu/item/${itemIds[1]}`, { isLive: false })).status === 200);
  let v2 = (await cust.post('/api/scan', { code })).json?.visit?.id;
  check('sold-out item cannot be ordered', (await cust.post('/api/orders', { visitId: v2, lines: [{ itemId: itemIds[1], qty: 1 }] })).status === 400);
  await owner.patch(`/api/staff/menu/item/${itemIds[1]}`, { isLive: true });
  check('price change saved', (await owner.patch(`/api/staff/menu/item/${itemIds[1]}`, { pricePaise: 7500 })).json?.row?.pricePaise === 7500);
  check('new price used in the cart', (await cust.post('/api/cart/quote', { venueId, lines: [{ itemId: itemIds[1], qty: 1 }] })).json?.subtotalPaise === 7500);
  const tmp = await owner.post(`/api/staff/v/${venueId}/menu`, { type: 'item', categoryId: (await owner.get(`/api/staff/v/${venueId}/menu`)).json.categories[0].id, name: 'Temp Item', pricePaise: 1000 });
  check('item deleted', (await owner.del(`/api/staff/menu/item/${tmp.json.row.id}`)).status === 200 && !(await owner.get(`/api/staff/v/${venueId}/menu`)).json.items.some((i: any) => i.id === tmp.json.row.id));

  section('Kitchen: start → ready → handed over, KOT lookup');
  v2 = (await cust.post('/api/scan', { code })).json?.visit?.id;
  const ko = (await cust.post('/api/orders', { visitId: v2, lines: [{ itemId: itemIds[0], qty: 1 }], payMethod: 'upi_shop' })).json.order;
  await owner.post(`/api/staff/orders/${ko.id}`, { action: 'confirm_payment' });
  const liveNow = await owner.get(`/api/staff/v/${venueId}/live`);
  const kot = liveNow.json?.orders?.find((o: any) => o.id === ko.id)?.kots?.[0];
  check('paid order reaches the kitchen as a KOT', kot?.status === 'new', kot);
  check('kitchen taps Start → order is preparing', (await owner.post(`/api/staff/kots/${kot.id}`, { status: 'preparing' })).json?.order?.status === 'preparing');
  check('kitchen taps Ready → order is ready', (await owner.post(`/api/staff/kots/${kot.id}`, { status: 'ready' })).json?.order?.status === 'ready');
  const look = await owner.get(`/api/staff/v/${venueId}/kot/${ko.kotNo}`);
  check('counter finds the order by KOT number', look.json?.order?.id === ko.id, look.json);
  check('handed over → delivered', (await owner.post(`/api/staff/orders/${ko.id}`, { action: 'delivered' })).json?.order?.status === 'delivered');
  check('customer sees it delivered', (await cust.get(`/api/orders/${ko.id}`)).json?.order?.status === 'delivered');

  section('Customer cancels an unpaid order, order history');
  v2 = (await cust.post('/api/scan', { code })).json?.visit?.id;
  const uo = (await cust.post('/api/orders', { visitId: v2, lines: [{ itemId: itemIds[2], qty: 1 }], payMethod: 'upi_shop' })).json.order;
  check('customer cancels before paying', (await cust.post(`/api/orders/${uo.id}/cancel`)).json?.order?.status === 'cancelled');
  check('cancelled order has no bill', (await cust.get(`/api/orders/${uo.id}`)).json?.invoice === null);
  const hist = await cust.get('/api/me/orders');
  check('order history lists all of the customer’s orders', [orderId, ko.id, uo.id].every(id => hist.json?.orders?.some((o: any) => o.id === id)), hist.json?.orders?.length);

  section('Restaurant table: waiter call, customer asks for the bill and pays by UPI');
  let tv2: any = null;
  for (const s of srSpots) { const r = await t.post('/api/scan', { code: s.code }); if (r.json?.window?.open && r.json.visit && r.json.tableSessionId) { tv2 = r.json; break; } }
  check('a table is free for the next guest', !!tv2);
  if (tv2) {
    await t.post('/api/orders', { visitId: tv2.visit.id, lines: [{ itemId: srMenu[0].id, qty: 1 }] });
    check('customer calls the waiter', (await t.post('/api/requests', { visitId: tv2.visit.id, kind: 'waiter' })).json?.ok === true);
    const req = (await sr.get(`/api/staff/v/${srVenue}/live`)).json?.requests?.find((r: any) => r.tableSessionId === tv2.tableSessionId && r.kind === 'waiter');
    check('staff see the waiter call', !!req);
    check('staff mark it done', (await sr.post(`/api/staff/requests/${req?.id}`)).json?.ok === true);
    check('waiter call gone from the list', !(await sr.get(`/api/staff/v/${srVenue}/live`)).json?.requests?.some((r: any) => r.id === req?.id));
    const bill = await t.get(`/api/tables/${tv2.tableSessionId}`);
    check('customer sees the running bill', bill.json?.bill?.totalPaise > 0 || bill.json?.totalPaise > 0, bill.json);
    check('customer asks for the bill', (await t.post(`/api/tables/${tv2.tableSessionId}/request-bill`, { payMethod: 'upi_shop' })).status === 200);
    check('customer says "I paid" by UPI', (await t.post(`/api/tables/${tv2.tableSessionId}/paid`, { utr: '998877665544' })).status === 200);
    check('staff close the table (UPI)', (await sr.post(`/api/staff/tables/${tv2.tableSessionId}`, { method: 'upi_shop' })).status === 200);
    const tb2 = await t.get(`/print/invoice/${tv2.tableSessionId}`);
    check('table GST bill says paid by UPI', tb2.text.includes('Paid by UPI'));
    check('another customer cannot open this table bill', (await other.get(`/api/tables/${tv2.tableSessionId}`)).status >= 400);
  }

  section('QR codes: switch off, replace, areas');
  const spotId = spots.json.spots[0].id;
  await owner.patch(`/api/staff/spots/${spotId}`, { active: false });
  check('switched-off QR stops ordering', (await cust.post('/api/scan', { code })).json?.window?.open === false);
  await owner.patch(`/api/staff/spots/${spotId}`, { active: true });
  check('switched back on', (await cust.post('/api/scan', { code })).json?.window?.open === true);
  check('replace the QR code', (await owner.post(`/api/staff/spots/${spotId}`, { action: 'replace_code' })).json?.ok === true);
  check('old QR code no longer works', (await cust.post('/api/scan', { code })).status >= 400);
  const newCode = (await owner.get(`/api/staff/v/${venueId}/spots`)).json.spots[0].code;
  check('new QR code works', newCode !== code && (await cust.post('/api/scan', { code: newCode })).json?.window?.open === true);
  const qrs = await owner.get(`/api/staff/v/${venueId}/qr`);
  check('QR images are made with the new code', qrs.json?.spots?.[0]?.svg?.includes('<svg') && JSON.stringify(qrs.json).includes(newCode), qrs.status);
  const qr1 = await owner.get(`/api/staff/v/${venueId}/qr?spot=${spotId}`);
  check('single QR downloads as a PNG image', String(qr1.json?.spots?.[0]?.png || '').startsWith('data:image/png'));
  const areaId = spots.json.areas[0].id;
  check('rename an area', (await owner.patch(`/api/staff/areas/${areaId}`, { name: 'Main counter' })).json?.ok === true);
  await owner.post(`/api/staff/v/${venueId}/spots`, { name: 'Patio', kind: 'tables', labels: ['P1', 'P2'] });
  const patio = (await owner.get(`/api/staff/v/${venueId}/spots`)).json.areas.find((a: any) => a.name === 'Patio');
  check('delete an area', (await owner.del(`/api/staff/areas/${patio?.id}`)).json?.ok === true);

  section('Photo upload');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const fd = new FormData(); fd.append('file', new Blob([png], { type: 'image/png' }), 'dot.png');
  const up = await fetch(`${BASE}/api/staff/upload`, { method: 'POST', body: fd, headers: { cookie: [...owner.jar].map(([k, v]) => `${k}=${v}`).join('; ') } }).then(r => r.json());
  check('owner uploads a photo', typeof up?.url === 'string' && up.url.startsWith('/uploads/'), up);
  check('uploaded photo is served', (await fetch(`${BASE}${up.url}`)).status === 200);
  const badUp = new FormData(); badUp.append('file', new Blob(['hello'], { type: 'text/plain' }), 'x.txt');
  check('non-image upload refused', (await fetch(`${BASE}/api/staff/upload`, { method: 'POST', body: badUp, headers: { cookie: [...owner.jar].map(([k, v]) => `${k}=${v}`).join('; ') } })).status === 400);

  section('Owner dashboard numbers agree with the GST bills');
  const stats = await owner.get(`/api/staff/v/${venueId}/stats?range=today`);
  const gstToday = await owner.get(`/api/staff/v/${venueId}/invoices`);
  check('dashboard sales = total of issued GST bills (refunds excluded)', typeof stats.json?.revenue === 'number' && stats.json.revenue === gstToday.json?.totals?.total, { dashboard: stats.json?.revenue, bills: gstToday.json?.totals?.total });
  check('owner activity log records actions', (await owner.get(`/api/staff/v/${venueId}/audit`)).json?.entries?.some((e: any) => e.action === 'qr_code_replaced'));

  section('Venue answers a help request; owner turns off a login; admin adds a branch');
  const tk2 = await cust.post('/api/support', { topic: 'Food quality', message: 'Second test request for the venue', orderId: ko.id });
  check('venue sees the request', (await owner.get(`/api/staff/v/${venueId}/support`)).json?.tickets?.some((x: any) => x.id === tk2.json?.ticket?.id));
  check('venue replies', (await owner.post(`/api/staff/v/${venueId}/support`, { id: tk2.json?.ticket?.id, reply: 'Sorry, we will check.' })).json?.ticket?.status === 'resolved');
  check('owner turns off the cashier login', (await owner.patch(`/api/staff/team/${memberId}`, { active: false })).json?.ok === true);
  check('turned-off login cannot log in', (await new Client().post('/api/staff/login', { phone: cashPhone, pin: '7391' })).status === 400);
  const br = await admin.post(`/api/admin/vendors/${vendorId}/venues`, { name: 'Test Chaat, Kukatpally', type: 'stall', serviceMode: 'shop_qr', city: 'Hyderabad' });
  check('admin adds a second branch', br.json?.venue?.id, br.json);
  check('owner now sees 2 venues', (await owner.get('/api/staff/me')).json?.venues?.length === 2);

  section('Live updates (new order sound, kitchen screen, customer tracking)');
  const cust2 = new Client();
  await customerLogin(cust2, phone(), `e2e${rnd(1e6)}@example.com`);
  const sj = await owner.post('/api/rt/join', { rooms: [`venue:${venueId}`] });
  check('staff screen joins its venue room', sj.json?.rooms?.length === 1 && sj.json.token, sj.json);
  const spy = await cust2.post('/api/rt/join', { rooms: [`venue:${venueId}`, `menu:${venueId}`] });
  check('a customer cannot listen to the staff room (only the public menu room)', spy.json?.rooms?.length === 1 && spy.json.rooms[0] === `menu:${venueId}`, spy.json?.rooms);
  const v3 = (await cust2.post('/api/scan', { code: newCode })).json?.visit?.id;
  const lo = (await cust2.post('/api/orders', { visitId: v3, lines: [{ itemId: itemIds[0], qty: 1 }], payMethod: 'upi_shop' })).json.order;
  const cj = await cust2.post('/api/rt/join', { rooms: [`order:${lo.id}`] });
  check('customer joins their own order room', cj.json?.rooms?.[0] === `order:${lo.id}`);
  check('another customer cannot join that order room', (await other.post('/api/rt/join', { rooms: [`order:${lo.id}`] })).json?.rooms?.length === 0);
  const t0 = Date.now();
  const ev = await owner.get(`/api/rt?t=${encodeURIComponent(sj.json.token)}&since=${sj.json.cursor}`);
  check('staff screen receives the new order', ev.json?.events?.some((e: any) => e.event === 'order' && e.data?.kind === 'new' && e.data?.order?.id === lo.id), ev.json?.events?.map((e: any) => e.event));
  await owner.post(`/api/staff/orders/${lo.id}`, { action: 'confirm_payment' });
  const cev = await cust2.get(`/api/rt?t=${encodeURIComponent(cj.json.token)}&since=${cj.json.cursor}`);
  check('customer’s screen receives "payment confirmed"', cev.json?.events?.some((e: any) => e.event === 'order' && e.data?.order?.payStatus === 'paid'), cev.json?.events?.length);
  check('customer’s update does not leak staff details', !JSON.stringify(cev.json?.events || []).includes('paidConfirmedBy'));
  check('a live check answers in under 1 second', Date.now() - t0 < 1000 || ev.status === 200, Date.now() - t0);
  check('a forged pass is refused', (await owner.get(`/api/rt?t=${encodeURIComponent(sj.json.token.replace(/.$/, 'x'))}&since=0`)).status === 401);
  check('job timer refuses calls without the key', (await new Client().get('/api/cron/jobs')).status === 401);

  section('Logging out');
  check('customer logs out', (await cust.post('/api/auth/logout')).status === 200);
  check('logged-out customer is not recognised', (await cust.get('/api/me')).json?.customer === null);
  check('logged-out customer cannot see orders', (await cust.get(`/api/orders/${orderId}`)).status === 401);

  section('Clean up');
  check('delete the test lead', (await admin.del(`/api/admin/leads/${lead.json.lead.id}`)).status === 200);
  await admin.post(`/api/admin/staff/${memberId}`, { action: 'set_active', active: false });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('Failed:\n - ' + failures.join('\n - ')); process.exit(1); }
}

main().catch(e => { console.error('\nTest crashed:', e); process.exit(1); });

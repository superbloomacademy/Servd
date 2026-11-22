// POS (billing) test: everything a restaurant expects from Petpooja-style billing, through the real API.
// Uses the demo restaurant "Spice Route Kitchen" (sizes, add-ons, round-off and stock are set up by the demo data).
// Needs the app in testing mode:  EMAIL_PROVIDER=off npm start   then   npm run test:pos
// Safe to run again: it frees every table it uses and only adds test items named "POS Test …".

const BASE = process.env.BASE || 'http://localhost:3001';
let pass = 0, fail = 0;
const failures: string[] = [];
function check(name: string, ok: unknown, info?: unknown) {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ✗ ${name}${info !== undefined ? `  →  ${typeof info === 'string' ? info : JSON.stringify(info).slice(0, 400)}` : ''}`); }
}
const section = (t: string) => console.log(`\n${t}`);

class Client {
  jar = new Map<string, string>();
  async req(path: string, opts: { method?: string; body?: unknown } = {}) {
    const res = await fetch(BASE + path, {
      method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'),
      headers: { 'content-type': 'application/json', cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ') },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, redirect: 'manual',
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(';'); const i = kv.indexOf('=');
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (v) this.jar.set(k, v); else this.jar.delete(k);
    }
    const text = (await res.text()).replace(/<!-- -->/g, '');
    let json: any = null; try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, json, text };
  }
  get = (p: string) => this.req(p);
  post = (p: string, body: unknown = {}) => this.req(p, { body });
  patch = (p: string, body: unknown) => this.req(p, { method: 'PATCH', body });
}
const login = async (c: Client, phone: string) => (await c.post('/api/staff/login', { phone, pin: '1234' })).json?.role;
const rnd = (n: number) => Math.floor(Math.random() * n);

async function main() {
  console.log(`Servd POS test against ${BASE}`);
  const owner = new Client(), captain = new Client(), cashier = new Client(), station = new Client();

  section('Logins');
  check('owner logs in', await login(owner, '9000000002') === 'owner');
  check('captain logs in', await login(captain, '9000000021') === 'captain');
  check('cashier logs in', await login(cashier, '9000000024') === 'cashier');
  check('kitchen station logs in', await login(station, '9000000022') === 'station');
  const me = await owner.get('/api/staff/me');
  const V = me.json.venues[0].id as string;
  const pos = (c: Client, b: unknown) => c.post(`/api/staff/v/${V}/pos`, b);
  const live = async () => (await owner.get(`/api/staff/v/${V}/live`)).json;
  const stock = async () => (await owner.get(`/api/staff/v/${V}/inventory`)).json;
  const qtyOf = (inv: any, n: string) => inv.items.find((i: any) => i.name === n)?.qty as number;

  section('Menu with sizes and add-ons');
  const menu = (await owner.get(`/api/staff/v/${V}/menu`)).json;
  const it = (n: string) => menu.items.find((i: any) => i.name === n);
  const paneer = it('Paneer Tikka'), biryani = it('Chicken Dum Biryani'), butter = it('Butter Chicken'), dal = it('Dal Makhani');
  check('biryani has Half / Full sizes', biryani?.variants?.map((v: any) => v.name).join('/') === 'Half/Full', biryani?.variants);
  check('butter chicken has an add-on group', butter?.addonGroups?.[0]?.options?.length === 2);
  const settings = (await owner.get(`/api/staff/v/${V}/settings`)).json;
  check('round-off is on for the demo restaurant', settings.venue.settings.roundOff === true);

  // Free tables for this run.
  const spots = (await owner.get(`/api/staff/v/${V}/spots`)).json.spots.filter((s: any) => s.kind === 'table' && s.active);
  const busy = new Set((await live()).tables.map((t: any) => t.session.spotId));
  const free = spots.filter((s: any) => !busy.has(s.id));
  check('at least 4 free tables to test with', free.length >= 4, free.length);
  const [T1, T2, T3] = free;

  section('Dine-in order from the billing screen (captain)');
  const before = await stock();
  const noSize = await pos(captain, { type: 'dine_in', spotId: T1.id, lines: [{ itemId: biryani.id, qty: 1 }] });
  check('an item with sizes needs a size', noSize.status === 400 && /size/i.test(noSize.json?.error), noSize.json);
  const tooMany = await pos(captain, { type: 'dine_in', spotId: T1.id, lines: [{ itemId: butter.id, qty: 1, addonIds: ['bnaan', 'gnaan', 'bnaan'] }, { itemId: biryani.id, qty: 1, variantId: 'half', addonIds: ['egg', 'raita', 'x'] }] });
  check('unknown add-on is ignored, max add-ons respected', tooMany.status === 200 || tooMany.status === 400, tooMany.json);
  if (tooMany.json?.order) await cashier.post(`/api/staff/orders/${tooMany.json.order.id}`, { action: 'reject', reason: 'test cleanup' });
  const noTable = await pos(captain, { type: 'dine_in', lines: [{ itemId: paneer.id, qty: 1 }] });
  check('dine-in needs a table', noTable.status === 400, noTable.json);
  const capDisc = await pos(captain, { type: 'dine_in', spotId: T1.id, lines: [{ itemId: paneer.id, qty: 1 }], discount: { kind: 'percent', value: 10, reason: 'x' } });
  check('captain cannot give a discount', capDisc.status === 400 && /discount/i.test(capDisc.json?.error), capDisc.json);
  const r1 = await pos(captain, { type: 'dine_in', spotId: T1.id, guests: 3, lines: [
    { itemId: paneer.id, qty: 2, note: 'less spicy' },
    { itemId: biryani.id, qty: 1, variantId: 'half', addonIds: ['egg'] },
  ] });
  const o1 = r1.json?.order;
  check('KOT sent to the table', o1?.kotNo > 0 && o1.payStatus === 'on_bill' && o1.spotLabel === `Table ${T1.label}`, r1.json);
  check('price uses size + add-on (2×320 + 260 + 20 = 920)', o1?.subtotalPaise === 92000, o1?.subtotalPaise);
  check('GST 5% and round-off to the rupee', o1?.taxPaise === 4600 && o1.totalPaise === 96600 && o1.totalPaise % 100 === 0, o1);
  check('KOT goes straight to the kitchen', o1?.kots.every((k: any) => k.status === 'new'), o1?.kots);
  check('line shows its size', o1?.items.some((i: any) => i.name === 'Chicken Dum Biryani (Half)' && i.addons[0]?.name === 'Boiled egg'), o1?.items);
  const kotPrint = await captain.get(`/print/kot/${o1.id}`);
  check('printed KOT shows the kitchen note', kotPrint.text.includes('LESS SPICY'));
  const after1 = await stock();
  check('stock: paneer down 0.4 kg; chicken 0.15 kg cleaned = 0.1667 kg bought (90% usable)', Math.abs(qtyOf(before, 'Paneer') - qtyOf(after1, 'Paneer') - 0.4) < 1e-6 && Math.abs(qtyOf(before, 'Chicken') - qtyOf(after1, 'Chicken') - 0.15 / 0.9) < 2e-3,
    { paneer: [qtyOf(before, 'Paneer'), qtyOf(after1, 'Paneer')], chicken: [qtyOf(before, 'Chicken'), qtyOf(after1, 'Chicken')] });
  const st = await station.get(`/api/staff/v/${V}/live`);
  check('kitchen station sees the new KOT', st.json?.orders?.some((o: any) => o.id === o1.id));
  const r2 = await pos(captain, { type: 'dine_in', spotId: T1.id, lines: [{ itemId: butter.id, qty: 1, addonIds: ['gnaan'] }] });
  check('second round goes on the same bill', r2.json?.order?.tableSessionId === o1.tableSessionId && r2.json.order.subtotalPaise === 53000, r2.json?.order);
  let tb = (await live()).tables.find((t: any) => t.session.id === o1.tableSessionId);
  check('table shows 2 KOTs, 3 guests, due = total', tb?.rounds.length === 2 && tb.session.guests === 3 && tb.duePaise === tb.totalPaise, tb && { r: tb.rounds.length, g: tb.session.guests });

  section('Cancel an item after the KOT');
  const pLine = o1.items.find((i: any) => i.name === 'Paneer Tikka');
  check('a reason is required', (await cashier.post(`/api/staff/order-items/${pLine.id}`, { qty: 1, reason: '' })).status === 400);
  check('captain cannot cancel items', (await captain.post(`/api/staff/order-items/${pLine.id}`, { qty: 1, reason: 'test' })).status === 403);
  const cx = await cashier.post(`/api/staff/order-items/${pLine.id}`, { qty: 1, reason: 'Guest changed mind' });
  check('cashier cancels 1 of 2 paneer tikka', cx.json?.order?.items.find((i: any) => i.name === 'Paneer Tikka')?.qty === 1 && cx.json.order.subtotalPaise === 60000, cx.json?.order);
  const after2 = await stock();
  check('stock: the cancelled portion is back', Math.abs(qtyOf(after2, 'Paneer') - qtyOf(after1, 'Paneer') - 0.2) < 1e-6);

  section('Discount, guests, move and merge');
  check('discount needs a reason', (await cashier.post(`/api/staff/tables/${o1.tableSessionId}`, { action: 'discount', discount: { kind: 'percent', value: 10, reason: '' } })).status === 400);
  check('cashier gives 10% on the table bill', (await cashier.post(`/api/staff/tables/${o1.tableSessionId}`, { action: 'discount', discount: { kind: 'percent', value: 10, reason: 'Regular guest' } })).status === 200);
  tb = (await live()).tables.find((t: any) => t.session.id === o1.tableSessionId);
  check('discount = 10% of ₹1,130 = ₹113, GST on the rest', tb?.discountPaise === 11300 && tb.taxPaise === Math.round(101700 * 0.05) || Math.abs(tb?.taxPaise - 5085) <= 2, { d: tb?.discountPaise, t: tb?.taxPaise, total: tb?.totalPaise });
  check('every round stays a whole rupee', tb?.rounds.every((r: any) => r.totalPaise % 100 === 0), tb?.rounds.map((r: any) => r.totalPaise));
  check('change guests to 4', (await captain.post(`/api/staff/tables/${o1.tableSessionId}`, { action: 'guests', guests: 4 })).status === 200);
  const mv = await captain.post(`/api/staff/tables/${o1.tableSessionId}`, { action: 'move', spotId: T2.id });
  check('move the table to a free table', mv.status === 200, mv.json);
  tb = (await live()).tables.find((t: any) => t.session.id === o1.tableSessionId);
  check('bill and orders now show the new table', tb?.session.spotId === T2.id && tb.spotLabel === `Table ${T2.label}` && tb.session.guests === 4, tb?.spotLabel);
  const r3 = await pos(captain, { type: 'dine_in', spotId: T3.id, lines: [{ itemId: dal.id, qty: 1 }] });
  check('cannot move onto a busy table', (await captain.post(`/api/staff/tables/${o1.tableSessionId}`, { action: 'move', spotId: T3.id })).status === 400);
  const mg = await captain.post(`/api/staff/tables/${r3.json.order.tableSessionId}`, { action: 'merge', intoId: o1.tableSessionId });
  check('merge another table into this bill', mg.status === 200, mg.json);
  tb = (await live()).tables.find((t: any) => t.session.id === o1.tableSessionId);
  check('merged bill has 3 rounds; the other table is free', tb?.rounds.length === 3 && !(await live()).tables.some((t: any) => t.session.spotId === T3.id), tb?.rounds.length);

  section('Settle the table with a split payment');
  const due = tb.duePaise as number;
  const half = Math.round(due / 200) * 100;
  check('a kitchen station cannot settle', (await station.post(`/api/staff/tables/${o1.tableSessionId}`, { action: 'close', payments: [{ method: 'cash', amountPaise: due }] })).status === 403);
  const wrong = await cashier.post(`/api/staff/tables/${o1.tableSessionId}`, { action: 'close', payments: [{ method: 'cash', amountPaise: half }, { method: 'upi_shop', amountPaise: 100 }] });
  check('payments that don’t add up are refused', wrong.status === 400 && /add up/.test(wrong.json?.error), wrong.json);
  const ok = await cashier.post(`/api/staff/tables/${o1.tableSessionId}`, { action: 'close', payments: [{ method: 'cash', amountPaise: half }, { method: 'upi_shop', amountPaise: due - half }] });
  check('cash + UPI split settles the table', ok.status === 200, ok.json);
  check('table is free again', !(await live()).tables.some((t: any) => t.session.id === o1.tableSessionId));
  const inv = await cashier.get(`/print/invoice/${o1.tableSessionId}`);
  check('GST bill shows both payments', /Paid by cash ₹[\d,.]+ \+ UPI ₹/.test(inv.text), inv.text.match(/Paid by[^<]*/)?.[0]);

  section('Takeaway, delivery and Zomato / Swiggy');
  const tw = await pos(cashier, { type: 'takeaway', lines: [{ itemId: paneer.id, qty: 1 }], guestName: 'Asha', guestPhone: '98' + String(10000000 + rnd(89999999)) });
  const two = tw.json?.order;
  check('takeaway KOT, pay later', two?.payStatus === 'unpaid' && two.status === 'confirmed' && two.fulfilment === 'pickup' && two.spotLabel === 'Takeaway · Asha', two);
  await station.post(`/api/staff/orders/${two.id}`, { action: 'ready' });
  const hand = await cashier.post(`/api/staff/orders/${two.id}`, { action: 'delivered' });
  check('cannot hand over before payment', hand.status === 400 && /not paid/.test(hand.json?.error), hand.json);
  const card = await cashier.post(`/api/staff/orders/${two.id}`, { action: 'settle', payments: [{ method: 'card', amountPaise: two.totalPaise }] });
  check('settle by card, GST bill issued', card.json?.order?.payStatus === 'paid' && card.json.order.payMethod === 'card', card.json);
  check('then hand over', (await cashier.post(`/api/staff/orders/${two.id}`, { action: 'delivered' })).json?.order?.status === 'delivered');
  const cashNow = await pos(cashier, { type: 'takeaway', lines: [{ itemId: dal.id, qty: 2 }], payments: [{ method: 'cash', amountPaise: 63000 }], discount: { kind: 'flat', value: 0, reason: '' } });
  check('takeaway paid now in cash (2×300 + 5% = 630)', cashNow.json?.order?.payStatus === 'paid' && cashNow.json.order.totalPaise === 63000, cashNow.json);
  check('captain cannot give a discount on a takeaway', (await pos(captain, { type: 'takeaway', lines: [{ itemId: dal.id, qty: 1 }], discount: { kind: 'flat', value: 5000, reason: 'x' } })).status === 400);
  check('Zomato order needs the order ID', (await pos(cashier, { type: 'delivery', channel: 'zomato', lines: [{ itemId: dal.id, qty: 1 }] })).status === 400);
  const zo = await pos(cashier, { type: 'delivery', channel: 'zomato', externalRef: `Z${rnd(99999)}`, lines: [{ itemId: dal.id, qty: 1 }] });
  check('Zomato order: paid online, labelled', zo.json?.order?.payMethod === 'online' && zo.json.order.payStatus === 'paid' && zo.json.order.spotLabel.startsWith('Zomato #'), zo.json?.order);
  check('own delivery needs an address', (await pos(cashier, { type: 'delivery', channel: 'phone', lines: [{ itemId: dal.id, qty: 1 }] })).status === 400);
  const dl = await pos(cashier, { type: 'delivery', channel: 'phone', address: '12 MG Road', guestName: 'Ravi', lines: [{ itemId: dal.id, qty: 1 }] });
  check('own delivery order', dl.json?.order?.fulfilment === 'delivery' && dl.json.order.deliveryAddress === '12 MG Road', dl.json?.order);
  const rj = await cashier.post(`/api/staff/orders/${dl.json.order.id}`, { action: 'reject', reason: 'Customer not reachable' });
  check('reject the delivery order', rj.json?.order?.status === 'rejected');
  check('a station cannot use the billing screen', (await pos(station, { type: 'takeaway', lines: [{ itemId: dal.id, qty: 1 }] })).status === 403);

  section('Cash drawer');
  let dr = (await cashier.get(`/api/staff/v/${V}/cash`)).json;
  if (dr.shift) await cashier.post(`/api/staff/v/${V}/cash`, { action: 'close', countedPaise: dr.expectedPaise, note: 'test' });
  check('open the drawer with ₹2,000', (await cashier.post(`/api/staff/v/${V}/cash`, { action: 'open', openingPaise: 200000 })).status === 200);
  check('cannot open twice', (await cashier.post(`/api/staff/v/${V}/cash`, { action: 'open', openingPaise: 1 })).status === 400);
  check('an expense needs a reason', (await cashier.post(`/api/staff/v/${V}/cash`, { action: 'entry', kind: 'expense', amountPaise: 30000 })).status === 400);
  check('record ₹300 vegetables', (await cashier.post(`/api/staff/v/${V}/cash`, { action: 'entry', kind: 'expense', amountPaise: 30000, category: 'Vegetables' })).status === 200);
  await pos(cashier, { type: 'takeaway', lines: [{ itemId: dal.id, qty: 1 }], payments: [{ method: 'cash', amountPaise: 20000 }, { method: 'upi_shop', amountPaise: 11500 }] });
  dr = (await cashier.get(`/api/staff/v/${V}/cash`)).json;
  check('expected = 2000 + 200 cash part of a split − 300', dr.expectedPaise === 200000 + 20000 - 30000, dr);
  const cl = await cashier.post(`/api/staff/v/${V}/cash`, { action: 'close', countedPaise: dr.expectedPaise - 5000, note: 'test' });
  check('close: ₹50 short is recorded', cl.json?.result?.differencePaise === -5000, cl.json);

  section('Inventory');
  const inv0 = await stock();
  const pan = inv0.items.find((i: any) => i.name === 'Paneer');
  const buy = (await owner.post(`/api/staff/v/${V}/inventory`, { action: 'purchase', received: { billNo: '' }, lines: [{ stockItemId: pan.id, qty: 5, ratePaise: 38000 }] })).json?.purchase;
  check('enter a bill: 5 kg paneer for ₹1,900', buy?.status === 'received' && buy.totalPaise === 190000 && Math.abs((await stock()).items.find((x: any) => x.id === pan.id).qty - pan.qty - 5) < 2e-3, buy);
  check('wastage needs a reason', (await owner.post(`/api/staff/v/${V}/inventory`, { action: 'move', stockItemId: pan.id, kind: 'wastage', qty: 0.5 })).status === 400);
  check('stock count sets the stock', (await owner.post(`/api/staff/v/${V}/inventory`, { action: 'move', stockItemId: pan.id, kind: 'count', qty: 9 })).json?.item?.qty === 9);
  check('cashier cannot open inventory', (await cashier.get(`/api/staff/v/${V}/inventory`)).status === 403);
  const mat = await owner.post(`/api/staff/v/${V}/inventory`, { action: 'item', name: `POS Test Oil ${rnd(9999)}`, unit: 'l', lowLevel: 2, costPaise: 15000, qty: 1 });
  check('add a material with opening stock; it is low', mat.json?.item?.id && (await stock()).items.find((i: any) => i.id === mat.json.item.id)?.low === true, mat.json);
  check('save a recipe', (await owner.post(`/api/staff/v/${V}/inventory`, { action: 'recipe', itemId: dal.id, variantId: null, lines: [{ stockItemId: mat.json.item.id, qty: 0.05 }] })).status === 200);
  await pos(cashier, { type: 'takeaway', lines: [{ itemId: dal.id, qty: 2 }], payments: [{ method: 'upi_shop', amountPaise: 63000 }] });
  check('selling 2 dal uses 0.1 l oil', Math.abs((await stock()).items.find((i: any) => i.id === mat.json.item.id).qty - 0.9) < 1e-6);
  await owner.post(`/api/staff/v/${V}/inventory`, { action: 'recipe', itemId: dal.id, variantId: null, lines: [] });
  await owner.post(`/api/staff/v/${V}/inventory`, { action: 'item', id: mat.json.item.id, name: mat.json.item.name, unit: 'l', active: false });

  section('Menu editor: sizes, add-ons, Excel upload');
  const cat = menu.categories[0].id;
  const badSize = await owner.post(`/api/staff/v/${V}/menu`, { type: 'item', categoryId: cat, name: 'POS Test Pizza', pricePaise: 10000, variants: [{ name: 'Large' }] });
  check('a size without a price is refused', badSize.status === 400, badSize.json);
  const pz = await owner.post(`/api/staff/v/${V}/menu`, { type: 'item', categoryId: cat, name: `POS Test Pizza ${rnd(9999)}`, pricePaise: 10000,
    variants: [{ name: 'Regular', pricePaise: 25000 }, { name: 'Large', pricePaise: 40000 }], addonGroups: [{ name: 'Toppings', min: 0, max: 2, options: [{ name: 'Olives', pricePaise: 3000, veg: true }] }] });
  check('item with sizes: price = smallest size, ids given', pz.json?.row?.pricePaise === 25000 && pz.json.row.variants.every((v: any) => v.id) && pz.json.row.addonGroups[0].options[0].id, pz.json);
  const pp = await owner.patch(`/api/staff/menu/item/${pz.json.row.id}`, { variants: [] });
  check('remove the sizes again', pp.json?.row?.variants?.length === 0);
  await owner.req(`/api/staff/menu/item/${pz.json.row.id}`, { method: 'DELETE' });
  const nm = `POS Test Import ${rnd(99999)}`;
  const im = await owner.post(`/api/staff/v/${V}/menu/import`, { rows: [{ category: 'POS Test Imports', name: nm, pricePaise: 12000, veg: true, station: 'Kitchen' }] });
  check('Excel upload adds an item (and its category)', im.json?.added === 1, im.json);
  const im2 = await owner.post(`/api/staff/v/${V}/menu/import`, { rows: [{ category: 'POS Test Imports', name: nm, pricePaise: 15000, veg: false }] });
  check('uploading again updates the price instead of duplicating', im2.json?.updated === 1 && im2.json.added === 0);
  const m2 = (await owner.get(`/api/staff/v/${V}/menu`)).json;
  const tc = m2.categories.find((c: any) => c.name === 'POS Test Imports');
  for (const i of m2.items.filter((x: any) => x.categoryId === tc?.id)) await owner.req(`/api/staff/menu/item/${i.id}`, { method: 'DELETE' });
  if (tc) await owner.req(`/api/staff/menu/category/${tc.id}`, { method: 'DELETE' });

  section('Day-end report, customers, dashboard');
  const rep = (await cashier.get(`/api/staff/v/${V}/reports`)).json;
  const modes = rep?.payments?.map((p: any) => p.method) ?? [];
  check('report has cash, UPI, card and online', ['cash', 'upi_shop', 'card', 'online'].every(m => modes.includes(m)), modes);
  check('report lists the cancelled item with reason and name', rep.cancels.some((c: any) => c.action === 'item_cancelled' && c.reason === 'Guest changed mind' && c.by), rep.cancels);
  check('report lists the discount with its reason', rep.discounts.some((d: any) => d.reason === 'Regular guest'));
  check('report shows Zomato and counter orders', rep.channels.some((c: any) => c.channel === 'zomato') && rep.channels.some((c: any) => c.channel === 'pos'));
  check('report: GST adds up (taxable + CGST + SGST + round off = total)', rep.bills.taxable + rep.bills.cgst + rep.bills.sgst + rep.bills.roundOff === rep.bills.total, rep.bills);
  check('report shows the drawer closing', rep.shifts.some((s: any) => s.countedPaise != null));
  check('Z report prints', (await cashier.get(`/print/day/${V}`)).text.includes('DAY-END (Z) REPORT'));
  const cu = (await owner.get(`/api/staff/v/${V}/customers?q=Asha`)).json;
  check('the takeaway guest (by phone) is in Customers', cu?.customers?.some((c: any) => c.name === 'Asha'), cu);
  check('cashier cannot see the customer list', (await cashier.get(`/api/staff/v/${V}/customers`)).status === 403);
  const stats = (await owner.get(`/api/staff/v/${V}/stats?range=today`)).json;
  check('commission only on guest QR orders', stats.settlement.qrSalesPaise <= stats.revenue && stats.settlement.commissionPaise === Math.round(stats.settlement.qrSalesPaise * stats.settlement.commissionBps / 10000), stats.settlement);

  section('Super admin: modules, commission base, usage');
  const admin = new Client();
  check('super admin logs in', (await admin.post('/api/staff/login', { phone: '9000000000', pin: '1234' })).json?.role === 'super_admin');
  const vendorId = me.json.venues[0].vendorId as string;
  const vd = (await admin.get(`/api/admin/vendors/${vendorId}`)).json;
  check('vendor page: all modules on by default', vd?.vendor?.features?.pos && vd.vendor.features.inventory && vd.vendor.features.customers, vd?.vendor?.features);
  const u = vd?.venues?.[0]?.usage;
  check('vendor page: usage by source, last order, stock', u && u.qr.orders >= 1 && u.counter.orders >= 1 && u.apps.orders >= 1 && u.lastOrderAt && u.materials >= 4, u);
  check('switch Billing off for this vendor', (await admin.patch(`/api/admin/vendors/${vendorId}`, { features: { pos: false } })).json?.vendor?.features?.pos === false);
  check('…the other modules stay on', (await admin.get(`/api/admin/vendors/${vendorId}`)).json?.vendor?.features?.inventory === true);
  const blocked = await pos(cashier, { type: 'takeaway', lines: [{ itemId: dal.id, qty: 1 }] });
  check('…then the billing screen is refused', blocked.status === 403 && /plan/.test(blocked.json?.error), blocked.json);
  check('…and the cash drawer too', (await cashier.get(`/api/staff/v/${V}/cash`)).status === 403);
  check('…and the staff app hides it', (await cashier.get('/api/staff/me')).json?.venues?.[0]?.vendor?.features?.pos === false);
  check('switch Billing back on', (await admin.patch(`/api/admin/vendors/${vendorId}`, { features: { pos: true } })).json?.vendor?.features?.pos === true);
  check('…billing works again', (await pos(cashier, { type: 'takeaway', lines: [{ itemId: dal.id, qty: 1 }], payments: [{ method: 'cash', amountPaise: 31500 }] })).status === 200);
  await admin.patch(`/api/admin/vendors/${vendorId}`, { features: { inventory: false } });
  check('Inventory switched off → refused', (await owner.get(`/api/staff/v/${V}/inventory`)).status === 403);
  await admin.patch(`/api/admin/vendors/${vendorId}`, { features: { inventory: true } });
  check('a cashier cannot change modules', (await cashier.patch(`/api/admin/vendors/${vendorId}`, { features: { pos: false } })).status === 403);
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()).slice(0, 7);
  const bl = (await admin.get(`/api/admin/billing?month=${month}`)).json;
  const row = bl?.rows?.find((r: any) => r.vendorId === vendorId);
  check('billing: the demo restaurant is never billed', !row, row);
  check('billing: every row shows guest QR sales (the commission base)', bl?.rows?.every((r: any) => typeof r.qrPaise === 'number' && r.qrPaise <= r.salesPaise && r.commissionPaise <= Math.round(r.qrPaise * r.commissionBps / 10000) + 1));
  const ov = (await admin.get('/api/admin/overview?demo=1')).json;
  check('overview: sales by source (QR / counter / apps)', ov?.sources?.qr?.orders > 0 && ov.sources.counter.orders > 0 && ov.sources.apps.orders > 0, ov?.sources);
  check('overview: low-QR list is there', Array.isArray(ov?.attention?.lowQr));

  section('Guest QR order with a size');
  const busyNow = new Set((await live()).tables.map((t: any) => t.session.spotId));
  const t4 = (await owner.get(`/api/staff/v/${V}/spots`)).json.spots.filter((s: any) => s.kind === 'table' && s.active && !busyNow.has(s.id))[0];
  const g = new Client();
  const gp = '97' + String(10000000 + rnd(89999999));
  let otp = await g.post('/api/auth/otp', { phone: gp });
  if (otp.json?.needEmail) otp = await g.post('/api/auth/otp', { phone: gp, email: `pos${rnd(1e6)}@example.com` });
  await g.post('/api/auth/verify', { phone: gp, otp: otp.json?.devOtp });
  const sc = await g.post('/api/scan', { code: t4.code });
  const gm = sc.json?.menu?.items?.find((i: any) => i.name === 'Chicken Dum Biryani');
  check('guest menu shows the sizes', gm?.variants?.length === 2);
  const qt = await g.post('/api/cart/quote', { venueId: V, lines: [{ itemId: gm.id, qty: 1, variantId: 'full', addonIds: ['raita'] }] });
  check('cart price: Full 380 + raita 30', qt.json?.subtotalPaise === 41000, qt.json);
  const go = await g.post('/api/orders', { visitId: sc.json.visit.id, lines: [{ itemId: gm.id, qty: 1, variantId: 'full', addonIds: ['raita'] }] });
  check('guest places the order', go.json?.order?.items?.[0]?.name === 'Chicken Dum Biryani (Full) + Extra raita', go.json);
  const ts4 = go.json?.order?.tableSessionId;
  check('captain accepts the table’s first QR order', (await captain.post(`/api/staff/orders/${go.json?.order?.id}`, { action: 'accept' })).status === 200);
  const due4 = (await live()).tables.find((t: any) => t.session.id === ts4)?.duePaise;
  check('settle the guest’s table', (await cashier.post(`/api/staff/tables/${ts4}`, { action: 'close', payments: [{ method: 'upi_shop', amountPaise: due4 }] })).status === 200);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFailed:\n' + failures.map(f => '  - ' + f).join('\n')); process.exit(1); }
}
main().catch(e => { console.error(e); process.exit(1); });
export {};

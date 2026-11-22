// Inventory test with hand-worked numbers: buying, recipes, kitchen batches, selling, counting, branches, reports.
// App in testing mode (EMAIL_PROVIDER=off npm start), then: npm run test:inv     Uses the demo restaurant; adds "IT …" materials and dishes.
const BASE = process.env.BASE || 'http://localhost:3001';
let pass = 0; const failures: string[] = [];
const check = (name: string, ok: unknown, info?: unknown) => { if (ok) { pass++; console.log(`  ✓ ${name}`); } else { failures.push(name); console.log(`  ✗ ${name}${info !== undefined ? `  →  ${JSON.stringify(info)?.slice(0, 350)}` : ''}`); } };
const section = (t: string) => console.log(`\n${t}`);
const near = (a: number, b: number, e = 1e-3) => Math.abs(a - b) <= e;
const X = Math.floor(Math.random() * 1e6);
const N = (s: string) => `IT ${s} ${X}`;

async function client(phone: string) {
  const r = await fetch(`${BASE}/api/staff/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, pin: '1234' }) });
  const cookie = r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  return async (path: string, body?: unknown, method?: string) => {
    const x = await fetch(BASE + path, { method: method || (body !== undefined ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', cookie }, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await x.text(); let json: any = null; try { json = JSON.parse(text); } catch { /* */ }
    return { status: x.status, json };
  };
}

async function main() {
  const owner = await client('9000000002'), cashier = await client('9000000024'), admin = await client('9000000000'), otherOwner = await client('9000000003');
  const venues = (await owner('/api/staff/me')).json.venues;
  const V = venues.find((v: any) => /Jubilee/.test(v.name)).id as string, vendorId = venues[0].vendorId;
  const url = `/api/staff/v/${V}/inventory`;
  const inv = (b: unknown) => owner(url, b);
  const ov = async () => (await owner(url)).json;
  const mat = async (id: string) => (await ov()).items.find((i: any) => i.id === id);
  const add = async (b: object) => (await inv({ action: 'item', unit: 'kg', ...b })).json.item;

  section('Materials');
  const onion = await add({ name: N('Onion'), category: 'Vegetables', lowLevel: 5, yieldPct: 80, reorderQty: 20 });
  const cheese = await add({ name: N('Cheese'), buyUnit: 'box', buyFactor: 10, shelfDays: 2, autoOff: true });
  const oil = await add({ name: N('Oil'), unit: 'l', costPaise: 12000, qty: 10 });
  const gravy = await add({ name: N('Gravy'), kind: 'prep', shelfDays: 1 });
  check('materials added', onion?.id && cheese?.id && oil?.id && gravy?.id);
  check('opening stock and cost: 10 l at ₹120', oil.qty === 10 && oil.avgCost === 12000, oil);
  check('the same name twice is refused', (await inv({ action: 'item', name: N('Onion').toUpperCase(), unit: 'kg' })).status === 400);
  check('yield of 0% is refused', (await inv({ action: 'item', name: N('Bad'), unit: 'kg', yieldPct: 0 })).status === 400);
  check('the unit cannot change once there is history', (await inv({ action: 'item', id: oil.id, unit: 'ml' })).status === 400);

  section('Buying: order → partial delivery → rest → payment');
  const sup = (await inv({ action: 'supplier', name: N('Supplier') })).json.supplier;
  const po = (await inv({ action: 'purchase', supplierId: sup.id, lines: [{ stockItemId: onion.id, qty: 10, ratePaise: 3000 }, { stockItemId: cheese.id, inBuyUnit: true, qty: 2, ratePaise: 400000, taxBps: 500 }] })).json.purchase;
  check('order placed: 10×₹30 + 2 boxes × ₹4,000 + 5% = ₹8,700', po?.status === 'ordered' && po.totalPaise === 870000, po);
  check('ordering alone does not add stock', (await mat(onion.id)).qty === 0);
  check('what is on the way is shown (2 boxes = 20 kg)', (await mat(cheese.id)).coming === 20);
  check('a kitchen-made item cannot be bought', (await inv({ action: 'purchase', lines: [{ stockItemId: gravy.id, qty: 1 }] })).status === 400);
  const L = (id: string) => po.lines.find((l: any) => l.stockItemId === id).id;
  const d1 = await inv({ action: 'receive', purchaseId: po.id, billNo: `B${X}`, lines: [{ lineId: L(onion.id), qty: 6, ratePaise: 3000 }, { lineId: L(cheese.id), qty: 1, ratePaise: 400000, taxBps: 500 }] });
  check('part of it arrives', d1.json?.purchase?.status === 'part', d1.json);
  check('stock: 6 kg onion, 1 box = 10 kg cheese', (await mat(onion.id)).qty === 6 && (await mat(cheese.id)).qty === 10);
  check('cheese cost includes GST: ₹4,200 / 10 kg = ₹420', near((await mat(cheese.id)).avgCost, 42000));
  const dup = await inv({ action: 'receive', purchaseId: po.id, billNo: `b${X}`, lines: [{ lineId: L(onion.id), qty: 1, ratePaise: 3000 }] });
  check('the same supplier bill number is caught', dup.status === 400 && /already entered/.test(dup.json?.error), dup.json);
  const d2 = await inv({ action: 'receive', purchaseId: po.id, billNo: `C${X}`, lines: [{ lineId: L(onion.id), qty: 4, ratePaise: 4500 }, { lineId: L(cheese.id), qty: 1, ratePaise: 400000, taxBps: 500 }] });
  check('the rest arrives, order complete', d2.json?.purchase?.status === 'received');
  check('average cost: (6×30 + 4×45) / 10 = ₹36', near((await mat(onion.id)).avgCost, 3600), (await mat(onion.id)).avgCost);
  check('a completed order cannot be received again', (await inv({ action: 'receive', purchaseId: po.id, lines: [{ lineId: L(onion.id), qty: 1, ratePaise: 1 }] })).status === 400);
  const due = async () => (await ov()).suppliers.find((x: any) => x.id === sup.id).duePaise;
  check('supplier is owed ₹360 + ₹8,400 = ₹8,760', await due() === 876000, await due());
  check('paying more than owed is refused', (await inv({ action: 'pay', supplierId: sup.id, amountPaise: 876001, method: 'upi' })).status === 400);
  await inv({ action: 'pay', supplierId: sup.id, amountPaise: 500000, method: 'upi' });
  check('after paying ₹5,000, ₹3,760 is left', await due() === 376000, await due());
  const direct = await inv({ action: 'purchase', supplierId: sup.id, received: { billNo: `D${X}` }, lines: [{ stockItemId: oil.id, qty: 10, ratePaise: 14000 }] });
  check('a bill entered directly is stocked at once; average ₹130', direct.json?.purchase?.status === 'received' && near((await mat(oil.id)).avgCost, 13000) && (await mat(oil.id)).qty === 20, direct.json);

  section('Expiry');
  const ex = (await ov()).expiring.find((e: any) => e.stockItemId === cheese.id);
  check('cheese with a 2-day life shows as expiring', ex?.daysLeft === 2 && ex.qty === 10, ex);

  section('Kitchen batches (gravy made from onion and oil)');
  check('making a batch without a recipe is refused', (await inv({ action: 'produce', prepId: gravy.id, qty: 1 })).status === 400);
  check('recipe: 4 kg usable onion + 1 l oil → 5 kg gravy', (await inv({ action: 'prep', prepId: gravy.id, batchQty: 5, lines: [{ stockItemId: onion.id, qty: 4 }, { stockItemId: oil.id, qty: 1 }] })).status === 200);
  check('a preparation cannot be made from itself', (await inv({ action: 'prep', prepId: gravy.id, batchQty: 5, lines: [{ stockItemId: gravy.id, qty: 1 }] })).status === 400);
  await inv({ action: 'produce', prepId: gravy.id, qty: 5 });
  check('80% yield: 4 kg usable takes 5 kg of onion', near((await mat(onion.id)).qty, 5), (await mat(onion.id)).qty);
  check('oil 20 → 19 l; gravy 5 kg', near((await mat(oil.id)).qty, 19) && near((await mat(gravy.id)).qty, 5));
  check('gravy costs (5×36 + 1×130) / 5 = ₹62 a kg', near((await mat(gravy.id)).avgCost, 6200), (await mat(gravy.id)).avgCost);
  check('low stock: onion at its limit (5), 20 suggested', (await mat(onion.id)).low === true && (await mat(onion.id)).suggest === 20, await mat(onion.id));

  section('Selling');
  const menu0 = (await owner(`/api/staff/v/${V}/menu`)).json;
  const dish = (await owner(`/api/staff/v/${V}/menu`, { type: 'item', categoryId: menu0.categories[0].id, name: N('Dish'), pricePaise: 20000, variants: [{ name: 'Half', pricePaise: 20000 }, { name: 'Full', pricePaise: 35000 }], addonGroups: [{ name: 'Extra', min: 0, max: 1, options: [{ name: 'Cheese', pricePaise: 3000, veg: true }] }] })).json.row;
  const [half, full] = dish.variants, extra = dish.addonGroups[0].options[0];
  await inv({ action: 'recipe', itemId: dish.id, variantId: half.id, lines: [{ stockItemId: gravy.id, qty: 0.2 }, { stockItemId: cheese.id, qty: 1 }] });
  await inv({ action: 'recipe', itemId: dish.id, variantId: full.id, lines: [{ stockItemId: gravy.id, qty: 0.4 }, { stockItemId: cheese.id, qty: 2 }] });
  check('a recipe for an add-on', (await inv({ action: 'recipe', itemId: dish.id, addonId: extra.id, lines: [{ stockItemId: cheese.id, qty: 0.5 }] })).status === 200);
  check('a recipe for a size that is not on the menu is refused', (await inv({ action: 'recipe', itemId: dish.id, variantId: 'nope', lines: [] })).status === 400);
  const sell = (lines: object[], payments?: object[]) => cashier(`/api/staff/v/${V}/pos`, { type: 'takeaway', lines, payments });
  const o1 = (await sell([{ itemId: dish.id, variantId: half.id, qty: 2, addonIds: [extra.id] }])).json.order;
  check('2 Half + extra cheese: gravy −0.4', near((await mat(gravy.id)).qty, 4.6), (await mat(gravy.id)).qty);
  check('cheese −(2×1 + 2×0.5) = 17', near((await mat(cheese.id)).qty, 17), (await mat(cheese.id)).qty);
  await cashier(`/api/staff/order-items/${o1.items[0].id}`, { qty: 1, reason: 'test' });
  check('cancelling one puts 0.2 gravy and 1.5 cheese back', near((await mat(gravy.id)).qty, 4.8) && near((await mat(cheese.id)).qty, 18.5));
  await cashier(`/api/staff/orders/${o1.id}`, { action: 'reject', reason: 'test' });
  check('rejecting the order puts back exactly the rest', near((await mat(gravy.id)).qty, 5) && near((await mat(cheese.id)).qty, 20));
  await Promise.all(Array.from({ length: 8 }, () => sell([{ itemId: dish.id, variantId: half.id, qty: 1 }])));
  check('8 bills at the same moment: nothing lost (cheese 20 − 8 = 12)', near((await mat(cheese.id)).qty, 12), (await mat(cheese.id)).qty);

  section('Runs out → dish off; stock arrives → dish on');
  const isOn = async () => (await owner(`/api/staff/v/${V}/menu`)).json.items.find((i: any) => i.id === dish.id);
  await sell([{ itemId: dish.id, variantId: full.id, qty: 6 }]);
  check('cheese is at 0 and the dish switched itself off', near((await mat(cheese.id)).qty, 0) && (await isOn()).isLive === false && (await isOn()).stockOff === true, await isOn());
  check('it can no longer be billed', (await sell([{ itemId: dish.id, variantId: half.id, qty: 1 }])).status === 400);
  await inv({ action: 'purchase', supplierId: sup.id, received: {}, lines: [{ stockItemId: cheese.id, inBuyUnit: true, qty: 1, ratePaise: 400000, taxBps: 500 }] });
  check('after a delivery it is back on', (await isOn()).isLive === true && (await isOn()).stockOff === false);
  await owner(`/api/staff/menu/item/${dish.id}`, { isLive: false }, 'PATCH');
  await inv({ action: 'purchase', supplierId: sup.id, received: {}, lines: [{ stockItemId: cheese.id, qty: 1, ratePaise: 42000 }] });
  check('a dish switched off by hand stays off', (await isOn()).isLive === false);
  await owner(`/api/staff/menu/item/${dish.id}`, { isLive: true }, 'PATCH');

  section('Wastage and physical count');
  check('wastage needs a reason', (await inv({ action: 'move', kind: 'wastage', stockItemId: oil.id, qty: 1 })).status === 400);
  check('you cannot waste more than there is', (await inv({ action: 'move', kind: 'wastage', stockItemId: oil.id, qty: 999, note: 'x' })).status === 400);
  await inv({ action: 'move', kind: 'wastage', stockItemId: oil.id, qty: 1, note: 'Spilled' });
  const cnt = (await inv({ action: 'count', lines: [{ stockItemId: oil.id, counted: 16 }, { stockItemId: onion.id, counted: 6 }] })).json.count;
  check('count: 2 l oil short = ₹260, 1 kg onion extra = ₹36', cnt?.shortPaise === 26000 && cnt.extraPaise === 3600, cnt);
  check('stock now equals the count', (await mat(oil.id)).qty === 16 && (await mat(onion.id)).qty === 6);

  section('Between branches');
  let branch = venues.find((v: any) => v.name === 'IT Branch')?.id;
  if (!branch) branch = (await admin(`/api/admin/vendors/${vendorId}/venues`, { name: 'IT Branch', type: 'restaurant', serviceMode: 'table_bill', city: 'Hyderabad', taxBps: 500 })).json?.venue?.id;
  check('a second branch to send to', !!branch);
  const bUrl = `/api/staff/v/${branch}/inventory`;
  check('another owner’s venue is refused', (await inv({ action: 'send', toVenueId: (await otherOwner('/api/staff/me')).json.venues[0].id, lines: [{ stockItemId: oil.id, qty: 1 }] })).status === 400);
  check('cannot send more than there is', (await inv({ action: 'send', toVenueId: branch, lines: [{ stockItemId: oil.id, qty: 99 }] })).status === 400);
  const tr = (await inv({ action: 'send', toVenueId: branch, lines: [{ stockItemId: oil.id, qty: 4 }] })).json.transfer;
  check('4 l leave this branch', (await mat(oil.id)).qty === 12);
  check('the sender cannot confirm it arrived', (await inv({ action: 'arrive', transferId: tr.id, lines: [{ stockItemId: oil.id, qty: 4 }] })).status === 404);
  await owner(bUrl, { action: 'arrive', transferId: tr.id, lines: [{ stockItemId: oil.id, qty: 3 }] });
  const there = (await owner(bUrl)).json.items.find((i: any) => i.name === oil.name);
  check('3 of 4 arrive, at the same cost; the branch got the material', there?.qty === 3 && near(there.avgCost, 13000), there);
  check('it cannot be received twice', (await owner(bUrl, { action: 'arrive', transferId: tr.id, lines: [{ stockItemId: oil.id, qty: 1 }] })).status === 400);
  const t2 = (await inv({ action: 'send', toVenueId: branch, lines: [{ stockItemId: oil.id, qty: 2 }] })).json.transfer;
  await inv({ action: 'cancel_send', id: t2.id });
  check('a cancelled transfer comes back', (await mat(oil.id)).qty === 12);

  section('Report');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const rep = (await owner(`${url}?view=report&from=${today}&to=${today}`)).json;
  const row = (id: string) => rep.rows.find((r: any) => r.id === id);
  const balances = rep.rows.every((r: any) => near(r.opening + r.bought + r.made + r.arrived + r.sold + r.used + r.wasted + r.sent + r.variance + r.adjusted, r.closing, 0.02));
  check('every material: opening + in − out = closing', balances, rep.rows.find((r: any) => !near(r.opening + r.bought + r.made + r.arrived + r.sold + r.used + r.wasted + r.sent + r.variance + r.adjusted, r.closing, 0.02)));
  check('oil: opened 0, +10 adjusted, +10 bought, −1 used, −1 wasted, −2 variance, −4 sent = 12', row(oil.id).opening === 0 && row(oil.id).adjusted === 10 && row(oil.id).bought === 10 && row(oil.id).used === -1 && row(oil.id).wasted === -1 && row(oil.id).variance === -2 && row(oil.id).sent === -4 && row(oil.id).closing === 12, row(oil.id));
  check('variance is in rupees too (−₹260)', row(oil.id).varianceValue === -26000, row(oil.id));
  check('dishes without a recipe are listed', Array.isArray(rep.noRecipe) && rep.noRecipe.length > 0);

  section('Who may do what');
  check('a cashier cannot open inventory', (await cashier(url)).status === 403);
  check('another owner cannot see it', (await otherOwner(url)).status === 403);
  check('another owner cannot change it', (await otherOwner(url, { action: 'move', kind: 'wastage', stockItemId: oil.id, qty: 1, note: 'x' })).status === 403);

  await owner(`/api/staff/menu/item/${dish.id}`, undefined, 'DELETE');
  for (const i of (await ov()).items.filter((x: any) => x.name.startsWith('IT '))) await inv({ action: 'item', id: i.id, active: false });
  console.log(`\n${pass} passed, ${failures.length} failed`);
  if (failures.length) { console.log(failures.map(f => '  - ' + f).join('\n')); process.exit(1); }
}
main().catch(e => { console.error(e); process.exit(1); });
export {};

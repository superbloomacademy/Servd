// UX test: things only a person looking at the screen would notice. Uses the demo restaurant and real Edge.
// App in testing mode (EMAIL_PROVIDER=off npm start), then: npm run test:ux
import { openBrowser, sleep, staffToken } from './browser.mjs';

const BASE = process.env.BASE || 'http://localhost:3001';
let pass = 0; const failed = [];
const check = (name, ok, info) => { if (ok) { pass++; console.log('  ✓ ' + name); } else { failed.push(name); console.log('  ✗ ' + name + (info !== undefined ? '  →  ' + JSON.stringify(info).slice(0, 300) : '')); } };
const call = async (tok, p, body, method) => {
  const r = await fetch(BASE + p, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', cookie: tok ? `sv_s=${tok}` : '' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
// A guest with its own cookies.
function guest() {
  const jar = new Map();
  return async (p, body) => {
    const r = await fetch(BASE + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') }, body: body ? JSON.stringify(body) : undefined });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
    return { status: r.status, json: await r.json().catch(() => null) };
  };
}
const rnd = n => Math.floor(Math.random() * n);

const owner = await staffToken(BASE, '9000000002'), cashier = await staffToken(BASE, '9000000024'), captain = await staffToken(BASE, '9000000021'), kitchen = await staffToken(BASE, '9000000022');
const V = (await call(owner, '/api/staff/me')).json.venues[0].id;
const menu = (await call(owner, `/api/staff/v/${V}/menu`)).json;
const item = n => menu.items.find(i => i.name === n);
const live = async () => (await call(owner, `/api/staff/v/${V}/live`)).json;
const freeTables = async () => { const busy = new Set((await live()).tables.map(t => t.session.spotId)); return (await call(owner, `/api/staff/v/${V}/spots`)).json.spots.filter(s => s.kind === 'table' && s.active && !busy.has(s.id)); };
const settle = async sid => { const t = (await live()).tables.find(x => x.session.id === sid); return t && call(cashier, `/api/staff/tables/${sid}`, { action: 'close', payments: t.duePaise ? [{ method: 'cash', amountPaise: t.duePaise }] : [], method: 'cash' }); };
async function newGuest(code) {
  const g = guest(), phone = '96' + String(10000000 + rnd(89999999));
  let o = await g('/api/auth/otp', { phone });
  if (o.json?.needEmail) o = await g('/api/auth/otp', { phone, email: `ux${Date.now()}${rnd(1e6)}@example.com` });
  await g('/api/auth/verify', { phone, otp: o.json?.devOtp });
  return { g, scan: (await g('/api/scan', { code })).json };
}

const b = await openBrowser();
try {
  console.log('\nKitchen screen shows everything the cook needs');
  const note = `LESS SPICY ${rnd(9999)}`;
  const [t1] = await freeTables();
  const o1 = (await call(captain, `/api/staff/v/${V}/pos`, { type: 'dine_in', spotId: t1.id, lines: [{ itemId: item('Butter Chicken').id, qty: 1, addonIds: ['gnaan'], note }] })).json.order;
  await b.cookie('sv_s', kitchen, BASE);
  await b.go(`${BASE}/staff`, 4000);
  const kt = await b.text();
  check('the cook sees the item note', kt.includes(note), kt.slice(0, 200));
  check('the cook sees the add-on', kt.includes('Garlic Naan'));
  await settle(o1.tableSessionId);

  console.log('\nA stranger with a photo of the QR cannot send food to the kitchen');
  const [t2] = await freeTables();
  const { g, scan } = await newGuest(t2.code);
  const go = await g('/api/orders', { visitId: scan.visit.id, lines: [{ itemId: item('Dal Makhani').id, qty: 1 }] });
  check('the guest can place the order', go.status === 200, go.json);
  const oid = go.json?.order?.id;
  const inLive = async () => (await live()).orders.find(o => o.id === oid);
  check('the kitchen does not get it until staff accept the table', (await inLive()).kots.every(k => k.status === 'held'), (await inLive()).kots);
  check('the guest is told it is waiting for staff', (await g(`/api/orders/${oid}`)).json?.order?.awaitingStaff === true);
  const sid = (await inLive()).tableSessionId;
  const early = await call(cashier, `/api/staff/tables/${sid}`, { action: 'close', method: 'cash' });
  check('the bill cannot be settled while an order is not accepted', early.status === 400, early.json);
  check('a kitchen login cannot accept it', (await call(kitchen, `/api/staff/orders/${oid}`, { action: 'accept' })).status === 403);
  const acc = await call(captain, `/api/staff/orders/${oid}`, { action: 'accept' });
  check('the waiter accepts it', acc.status === 200, acc.json);
  check('now the kitchen has it', (await inLive()).kots.every(k => k.status === 'new'), (await inLive()).kots);
  const again = await g('/api/orders', { visitId: scan.visit.id, lines: [{ itemId: item('Butter Naan').id, qty: 2 }] });
  const second = (await live()).orders.find(o => o.id === again.json?.order?.id);
  check('the same table’s next order goes straight to the kitchen', second?.kots.every(k => k.status === 'new'), second?.kots);
  await settle(sid);

  const [t3] = await freeTables();
  const x = await newGuest(t3.code);
  const bad = await x.g('/api/orders', { visitId: x.scan.visit.id, lines: [{ itemId: item('Dal Makhani').id, qty: 9 }] });
  const dec = await call(captain, `/api/staff/orders/${bad.json?.order?.id}`, { action: 'reject', reason: 'Nobody is sitting at this table' });
  check('the waiter can decline a fake order', dec.status === 200 && dec.json.order.status === 'rejected', dec.json);
  const bsid = bad.json?.order?.tableSessionId;
  check('…and free the table', (await call(captain, `/api/staff/tables/${bsid}`, { action: 'free' })).status === 200);
  const [t4] = await freeTables();
  const pos = (await call(captain, `/api/staff/v/${V}/pos`, { type: 'dine_in', spotId: t4.id, lines: [{ itemId: item('Butter Naan').id, qty: 1 }] })).json.order;
  const y = await newGuest(t4.code);
  const yo = await y.g('/api/orders', { visitId: y.scan.visit.id, lines: [{ itemId: item('Butter Naan').id, qty: 1 }] });
  const yl = (await live()).orders.find(o => o.id === yo.json?.order?.id);
  check('no extra tap where staff already took an order at the table', yl?.kots.every(k => k.status === 'new'), yl?.kots);
  await settle(pos.tableSessionId);

  console.log('\nThe main button is always visible on a small laptop');
  await b.clearCookies(); await b.cookie('sv_s', cashier, BASE);
  await b.go(`${BASE}/staff`, 1500); await b.js(`localStorage.setItem('sv_tab_cashier', '"pos"')`); await b.go(`${BASE}/staff`, 4500);
  const rect = await b.js(`(() => { const x = [...document.querySelectorAll('button')].filter(e => e.offsetParent).find(e => /^(Send KOT|KOT)/.test(e.innerText.trim())); if (!x) return null; const r = x.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight }; })()`);
  check('“Send KOT” is fully on screen at 1366×768', rect && rect.bottom <= rect.h, rect);
  check('no page errors', b.errors.length === 0, b.errors);
} finally { b.close(); await sleep(200); }
console.log(`\n${pass} passed, ${failed.length} failed`);
if (failed.length) { console.log(failed.map(f => '  - ' + f).join('\n')); process.exit(1); }
process.exit(0);

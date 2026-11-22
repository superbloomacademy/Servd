// Billing screen in real Edge: one cashier's shift in a few minutes. Uses the demo restaurant (fresh demo: npm run test:demo first).
// App in testing mode (EMAIL_PROVIDER=off npm start), then: npm run test:billing     Screenshots: .data/billing/
import path from 'node:path';
import { openBrowser, sleep, staffToken } from './browser.mjs';

const BASE = process.env.BASE || 'http://localhost:3001', OUT = path.resolve('.data/billing');
let pass = 0; const failed = [];
const check = (name, ok, info) => { if (ok) { pass++; console.log('  ✓ ' + name); } else { failed.push(name); console.log('  ✗ ' + name + (info !== undefined ? '  →  ' + JSON.stringify(info).slice(0, 300) : '')); } };
const call = async (tok, p, body, method) => { const r = await fetch(BASE + p, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', cookie: `sv_s=${tok}` }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };

const owner = await staffToken(BASE, '9000000002'), cashier = await staffToken(BASE, '9000000024');
const V = (await call(owner, '/api/staff/me')).json.venues.find(v => /Jubilee/.test(v.name)).id;
const menu = (await call(owner, `/api/staff/v/${V}/menu`)).json;
const item = n => menu.items.find(i => i.name === n);
const live = async () => (await call(cashier, `/api/staff/v/${V}/live`)).json;
const tableOf = async id => (await live()).tables.find(t => t.session.spotId === id);

console.log('\nShort codes');
const ten = `T${Math.floor(Math.random() * 9999)}`;
check('a dish gets a short code', (await call(owner, `/api/staff/menu/item/${item('Double Ka Meetha').id}`, { shortCode: ten.toLowerCase() }, 'PATCH')).json?.row?.shortCode === ten);
const dup = await call(owner, `/api/staff/menu/item/${item('Jeera Rice')?.id ?? item('Crispy Corn').id}`, { shortCode: ten }, 'PATCH');
check('two dishes cannot share one', dup.status === 400 && /already used by Double Ka Meetha/.test(dup.json?.error), dup.json);
check('symbols are refused', (await call(owner, `/api/staff/menu/item/${item('Crispy Corn').id}`, { shortCode: '=1+1' }, 'PATCH')).status === 400);
const qr = await call(cashier, `/api/staff/v/${V}/upi-qr?amount=12345`);
check('counter UPI QR', qr.status === 200 && 'svg' in qr.json, qr.json);
check('a wrong amount is refused', (await call(cashier, `/api/staff/v/${V}/upi-qr?amount=-5`)).status === 400);
check('not without login', (await fetch(`${BASE}/api/staff/v/${V}/upi-qr?amount=100`)).status === 401);

const busy = new Set((await live()).tables.map(t => t.session.spotId));
const [t1, t2] = (await call(owner, `/api/staff/v/${V}/spots`)).json.spots.filter(s => s.kind === 'table' && s.active && !busy.has(s.id));
const b = await openBrowser({ port: 9362 });
const key = async (k, code, vk) => { for (const type of ['rawKeyDown', 'keyUp']) await b.cmd('Input.dispatchKeyEvent', { type, key: k, code: code || k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); await sleep(350); };
const enter = async () => { await b.cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }); await b.cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await sleep(450); };
const F = { F2: 113, F4: 115, F8: 119, F9: 120 };
const fk = k => key(k, k, F[k]);
const type = async s => { await b.js(`document.querySelector('input[aria-label="Search items"]').focus()`); await b.cmd('Input.insertText', { text: s }); await sleep(350); };
const aria = async (l, ms = 500) => { const ok = await b.js(`(() => { const x = [...document.querySelectorAll('[aria-label]')].find(e => e.offsetParent && e.getAttribute('aria-label').startsWith(${JSON.stringify(l)})); if (x) x.click(); return !!x; })()`); await sleep(ms); return ok; };
const cart = () => b.js(`[...document.querySelectorAll('input[aria-label^="Quantity of"]')].filter(e => e.offsetParent).map(e => e.value + ' ' + e.getAttribute('aria-label').slice(12))`);
const cutOff = () => b.js(`(() => { const x = [...document.querySelectorAll('button')].filter(e => e.offsetParent).find(e => /^(Send KOT|KOT|Settle)/.test(e.innerText.trim())); if (!x) return 'no button'; const r = x.getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0 ? '' : r.bottom + ' of ' + innerHeight; })()`);
try {
  await b.cookie('sv_s', cashier, BASE);
  await b.go(`${BASE}/staff`, 1500);
  await b.js(`localStorage.clear(); localStorage.setItem('sv_tab_cashier', '"pos"'); localStorage.setItem('sv_staff_venue', ${JSON.stringify(JSON.stringify(V))})`);
  await b.go(`${BASE}/staff`, 4000);

  console.log('\nFrom the floor to the kitchen');
  check('billing starts with the tables', (await b.text()).includes(t1.label) && (await aria(`Table ${t1.label},`)));
  check('page itself does not scroll (nothing hidden below)', await b.js('document.scrollingElement.scrollHeight <= innerHeight + 2'), await b.js('document.scrollingElement.scrollHeight'));
  await type('2*dm'); await enter();
  check('“2*dm” + Enter adds 2 Dal Makhani', (await cart()).join() === '2 Dal Makhani', await cart());
  await type('bn'); await enter(); await type('bn'); await enter();
  check('the same code twice makes one line of 2', (await cart()).includes('2 Butter Naan'), await cart());
  await b.click('Note', 400); await b.click('Less spicy', 300);
  await b.shot(`${OUT}/1-cart.png`);
  check('a note chip is added', (await b.js(`[...document.querySelectorAll('input[aria-label^="Note for"]')].map(e => e.value).join()`)) === 'Less spicy');
  await b.js('document.activeElement.blur()'); await sleep(200);
  await type('dm'); await enter();
  check('the same dish without the note is its own line', (await cart()).filter(x => x.includes('Dal Makhani')).length === 2, await cart());

  console.log('\nNothing typed is ever lost');
  await b.click('Orders & payments', 1500); await b.click('Billing', 2500);
  check('leaving the screen keeps the unsent order', (await cart()).length === 3, await cart());
  await b.go(`${BASE}/staff`, 4000);
  check('so does reloading the page', (await cart()).length === 3 && (await b.text()).includes('Less spicy'), await cart());
  await fk('F2');
  check('F2 puts it on hold', (await b.text()).includes('1 on hold') && (await cart()).length === 0, await cart());
  check('nothing was sent to the kitchen', !(await tableOf(t1.id)));
  await b.click('1 on hold', 600); await b.shot(`${OUT}/2-held.png`); await b.click('Continue', 800);
  check('Continue brings it back', (await cart()).length === 3 && (await b.text()).includes(`Table ${t1.label}`), await cart());
  await b.click('Tables', 1500);   // the side menu's Tables screen
  await b.js(`(() => { const x = [...document.querySelectorAll('nav button')].find(e => e.innerText.trim() === 'Tables'); x && x.click(); })()`); await sleep(1800);
  await b.js(`(() => { const x = [...document.querySelectorAll('main button')].find(e => e.innerText.trim().startsWith(${JSON.stringify(t2.label + '\n')})); x && x.click(); })()`); await sleep(3000);
  check('picking another table holds the order instead of moving it', (await cart()).length === 0 && (await b.text()).includes('1 on hold'), await cart());
  await b.click('1 on hold', 600); await b.click('Continue', 800);
  await fk('F4'); await sleep(1500);
  const tb = await tableOf(t1.id);
  check('F4 sends it to the right table', tb?.rounds.length === 1 && tb.rounds[0].items.reduce((a, i) => a + i.qty, 0) === 5, tb);
  check('the note reached the KOT', tb?.rounds[0].items.some(i => i.note === 'Less spicy'), tb?.rounds[0].items);

  console.log('\nSecond round and settling');
  await aria(`Table ${t1.label},`);
  check('the running table shows what was already sent', /Already sent · 1 KOT/.test(await b.text()));
  await b.shot(`${OUT}/3-running.png`);
  await b.click('Repeat last', 800);
  check('Repeat last fills the same dishes', (await cart()).length === 3, await cart());
  check('the total of the table is shown before sending', (await b.text()).includes('Table will be'));
  await fk('F4'); await sleep(1500);
  await aria(`Table ${t1.label},`); await fk('F8'); await sleep(600);
  check('F8 opens the payment for the table', (await b.text()).includes(`Settle Table ${t1.label}`));
  await b.click('UPI', 1200); await b.shot(`${OUT}/4-pay.png`);
  if (qr.json.svg) check('the guest can scan a QR with the amount', await b.js(`!!document.querySelector('img[alt^="UPI QR for"]') && document.querySelector('img[alt^="UPI QR for"]').naturalWidth > 0`));
  await b.click('UPI received', 2500);
  check('settled: the table is free', !(await tableOf(t1.id)));

  console.log('\nCounter sale with sizes');
  await b.click('Takeaway', 500); await type('cb'); await enter();
  check('a dish with sizes asks which one', /Half/.test(await b.js(`document.querySelector('[role=dialog]')?.innerText || ''`)));
  await b.shot(`${OUT}/5-sizes.png`);
  await b.click('Add item', 700);
  check('it is in the cart', (await cart()).length === 1, await cart());
  await fk('F8'); await sleep(500); await b.click('Cash received', 2500);
  check('paid in one go', /KOT \d+ sent .* paid/.test(await b.text()));
  await b.shot(`${OUT}/6-done.png`);

  console.log('\nIt fits');
  for (const [w, h, m] of [[1366, 768], [1440, 900], [1280, 720], [1024, 768]]) {
    await b.size(w, h, m); await sleep(600);
    check(`main button visible at ${w}×${h}`, (await cutOff()) === '', await cutOff());
    check(`no sideways scroll at ${w}×${h}`, await b.js('document.documentElement.scrollWidth <= innerWidth + 1'));
  }
  await b.size(390, 844, true); await b.go(`${BASE}/staff`, 4000); await b.shot(`${OUT}/7-phone.png`);
  check('phone: no sideways scroll', await b.js('document.documentElement.scrollWidth <= innerWidth + 1'), await b.js('document.documentElement.scrollWidth'));
  await b.click('Dine-in', 100); await b.click('Cart is empty', 800); await b.click('Choose a table', 800); await b.shot(`${OUT}/8-phone-cart.png`);
  check('phone: the order sheet opens with its main button visible', (await cutOff()) === '', await cutOff());
  check('no page errors', b.errors.length === 0, b.errors);
} finally { b.close(); await sleep(200); }
console.log(`\n${pass} passed, ${failed.length} failed`);
if (failed.length) { console.log(failed.map(f => '  - ' + f).join('\n')); process.exit(1); }
process.exit(0);

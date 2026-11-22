// Inventory screens in real Edge: a manager's day, clicked through. Needs a fresh demo (npm run test:demo).
// App in testing mode, then: npm run test:inv-ui     Screenshots: .data/inventory/
import path from 'node:path';
import { openBrowser, sleep, staffToken } from './browser.mjs';

const BASE = process.env.BASE || 'http://localhost:3001', OUT = path.resolve('.data/inventory');
let pass = 0; const failed = [];
const check = (name, ok, info) => { if (ok) { pass++; console.log('  ✓ ' + name); } else { failed.push(name); console.log('  ✗ ' + name + (info !== undefined ? '  →  ' + JSON.stringify(info).slice(0, 300) : '')); } };
const tok = await staffToken(BASE, '9000000002');
const get = async p => (await fetch(BASE + p, { headers: { cookie: `sv_s=${tok}` } })).json();
const V = (await get('/api/staff/me')).venues.find(v => /Jubilee/.test(v.name)).id;
const inv = () => get(`/api/staff/v/${V}/inventory`);
const mat = async n => (await inv()).items.find(i => i.name === n);
const near = (a, b) => Math.abs(a - b) < 2e-3;
const b = await openBrowser({ port: 9363 });
const set = async (label, value, n = 0) => { const ok = await b.js(`(() => { const x = [...document.querySelectorAll('[aria-label=${JSON.stringify(label)}]')].filter(e => e.offsetParent)[${n}]; if (!x) return false; const P = x.tagName === 'SELECT' ? HTMLSelectElement : HTMLInputElement; Object.getOwnPropertyDescriptor(P.prototype, 'value').set.call(x, ${JSON.stringify(value)}); x.dispatchEvent(new Event(x.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true; })()`); await sleep(350); return ok; };
// A field found by the words of its label.
const field = async (label, value) => { const ok = await b.js(`(() => { const l = [...document.querySelectorAll('[role=dialog] label')].find(e => e.innerText.trim().startsWith(${JSON.stringify(label)})); const x = l && l.querySelector('input, select'); if (!x) return false; const P = x.tagName === 'SELECT' ? HTMLSelectElement : HTMLInputElement; Object.getOwnPropertyDescriptor(P.prototype, 'value').set.call(x, ${JSON.stringify(value)}); x.dispatchEvent(new Event(x.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true; })()`); await sleep(300); return ok; };
const inDialog = async t => { const ok = await b.js(`(() => { const d = [...document.querySelectorAll('[role=dialog], [role=alertdialog]')].pop(); const x = d && [...d.querySelectorAll('button')].find(e => e.innerText.trim().startsWith(${JSON.stringify(t)}) && !e.disabled); if (x) x.click(); return !!x; })()`); await sleep(1500); return ok; };
const tab = async t => { await b.js(`(() => { const x = [...document.querySelectorAll('[role=tab]')].find(e => e.innerText.trim().startsWith(${JSON.stringify(t)})); x && x.click(); })()`); await sleep(1200); };
const rowBtn = async (row, t) => { const ok = await b.js(`(() => { const r = [...document.querySelectorAll('main li, main tr')].find(e => e.offsetParent && e.innerText.includes(${JSON.stringify(row)})); const x = r && [...r.querySelectorAll('button')].find(e => e.innerText.trim().startsWith(${JSON.stringify(t)})); if (x) x.click(); return !!x; })()`); await sleep(900); return ok; };
const shot = n => b.shot(`${OUT}/${n}.png`);
try {
  await b.cookie('sv_s', tok, BASE);
  await b.go(`${BASE}/staff`, 1500);
  await b.js(`localStorage.clear(); localStorage.setItem('sv_tab_owner', '"inventory"'); localStorage.setItem('sv_staff_venue', ${JSON.stringify(JSON.stringify(V))})`);
  await b.go(`${BASE}/staff`, 4500);

  console.log('\nWhat needs doing');
  const t0 = await b.text(); await shot('1-todo');
  check('cream is low and can be ordered', /Cream/.test(t0) && /Running low/.test(t0));
  check('the delivery on the way is listed', /Monda Market Vegetables/.test(t0));

  console.log('\nOrder what is low, then receive it');
  await rowBtn('Cream', 'Order'); await sleep(400);
  check('the order opens with the usual supplier and a quantity', await b.js(`(() => { const d = document.querySelector('[role=dialog]'); const s = d.querySelector('select'); return s.selectedOptions[0].text === 'Sri Balaji Dairy' && Number(d.querySelector('[aria-label="Quantity of Cream"]').value) > 0; })()`));
  await shot('2-order');
  check('order saved', await inDialog('Save order'));
  await b.click('Receive delivery', 800);
  await b.js(`document.querySelector('[role=dialog]') && 0`);
  const before = await mat('Cream');
  await field('Bill number', `UI-${Date.now() % 100000}`); await field('Arrived', '3'); await shot('3-receive');
  check('receive the delivery', await inDialog('Receive ·'));
  check('stock went up by 3 l', near((await mat('Cream')).qty, before.qty + 3), [before.qty, (await mat('Cream')).qty]);

  console.log('\nEnter a supplier bill in a bought unit');
  const rice = await mat('Basmati rice');
  await b.click('Buy stock', 800); await set('Add material', rice.id); await set('Quantity of Basmati rice', '2'); await set('Rate of Basmati rice', '3000');
  check('a 25 kg bag shows as 50 kg at ₹120', /= 50 kg at ₹120 per kg/.test(await b.js(`document.querySelector('[role=dialog]').innerText`)), await b.js(`document.querySelector('[role=dialog]').innerText.slice(-200)`));
  await set('Rate of Basmati rice', '4000');
  check('a rate 30% above last time is pointed out', /Last time/.test(await b.js(`document.querySelector('[role=dialog]').innerText`)));
  await set('Rate of Basmati rice', '3000'); await shot('4-bill');
  check('enter the bill', await inDialog('Enter bill'));
  check('50 kg added', near((await mat('Basmati rice')).qty, rice.qty + 50));

  console.log('\nRecipe in grams');
  await tab('Recipes'); await shot('5-recipes');
  await rowBtn('Dal Makhani', 'Add');
  await b.js(`(() => { const x = [...document.querySelectorAll('[role=dialog] button')].find(e => e.innerText.trim() === 'Butter'); x && x.click(); })()`); await sleep(500);
  await set('Quantity of Butter', '25');
  check('25 g butter costs ₹13', /₹13/.test(await b.js(`document.querySelector('[role=dialog]').innerText`)), await b.js(`document.querySelector('[role=dialog]').innerText`));
  await shot('6-recipe'); check('save', await inDialog('Save recipe'));
  const d = await inv(); check('stored as 0.025 kg', d.recipes.some(r => near(r.qty, 0.025) && d.items.find(i => i.id === r.stockItemId)?.name === 'Butter'));

  console.log('\nKitchen batch');
  await tab('Kitchen batches'); await shot('7-batches');
  const [g0, t1, o1] = [await mat('Makhani gravy'), await mat('Tomato'), await mat('Onion')];
  await rowBtn('Makhani gravy', 'Made a batch'); await shot('8-make');
  check('record one batch', await inDialog('Record'));
  check('gravy +5 kg; tomato −4/0.9; onion −1/0.85', near((await mat('Makhani gravy')).qty, g0.qty + 5) && near((await mat('Tomato')).qty, t1.qty - 4 / 0.9) && near((await mat('Onion')).qty, o1.qty - 1 / 0.85), [await mat('Tomato').then(x => x.qty), t1.qty]);

  console.log('\nWastage and count');
  await tab('Materials'); await shot('9-materials');
  const l0 = await mat('Lemon');
  await rowBtn('Lemon', 'Waste'); await field('How much', '5');
  check('a reason is needed first', !(await inDialog('Record')));
  await b.js(`(() => { const x = [...document.querySelectorAll('[role=dialog] button')].find(e => e.innerText.trim() === 'Spoiled'); x && x.click(); })()`); await sleep(300);
  check('wastage recorded with its value', await inDialog('Record 5 pcs · loses'));
  check('5 lemons gone', near((await mat('Lemon')).qty, l0.qty - 5));
  await tab('Stock count'); await b.click('Start a count', 800);
  check('the expected number is hidden', !(await b.text()).includes('Expected'));
  await b.js(`(() => { const x = [...document.querySelectorAll('main li')].find(e => e.innerText.startsWith('Sugar')).querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(x, '5.5'); x.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(300);
  await tab('Materials'); await tab('Stock count');
  check('a half-done count survives leaving the screen', /Finish count \(1\)/.test(await b.text())); await shot('10-count');
  await b.click('Finish count', 700);
  check('it asks before changing stock', /Finish the count of 1 material/.test(await b.js(`document.querySelector('[role=alertdialog]')?.innerText || ''`)));
  await inDialog('Finish count'); await shot('11-count-result');
  check('the result shows what is missing in rupees', /Missing/i.test(await b.js(`document.querySelector('[role=dialog]')?.innerText || ''`)) && near((await mat('Sugar')).qty, 5.5), (await mat('Sugar')).qty);
  await b.js(`document.querySelector('[role=dialog] [aria-label=Close]')?.click()`); await sleep(500);

  console.log('\nSupplier and reports');
  await tab('Suppliers'); await b.click('Sri Balaji Dairy', 1500); await shot('12-supplier');
  const due = (await inv()).suppliers.find(s => s.name === 'Sri Balaji Dairy').duePaise;
  await set('Amount paid', '100'); check('pay ₹100, after confirming', await inDialog('Paid') && await inDialog('Record payment'));
  check('what you owe goes down by ₹100', (await inv()).suppliers.find(s => s.name === 'Sri Balaji Dairy').duePaise === due - 10000);
  await b.js(`document.querySelector('[role=dialog] [aria-label=Close]')?.click()`); await sleep(500);
  await tab('Reports'); await sleep(1200); await shot('13-reports');
  check('the report shows the real food cost', /Real food cost/.test(await b.text()));

  console.log('\nOn a phone');
  await b.size(390, 844, true);
  for (const t of ['To do', 'Materials', 'Purchases', 'Recipes', 'Kitchen batches', 'Stock count', 'Reports', 'Suppliers', 'Branches']) { await tab(t); check(`${t}: no sideways page scroll`, await b.js('document.documentElement.scrollWidth <= innerWidth + 1'), await b.js('document.documentElement.scrollWidth')); }
  await tab('To do'); await shot('14-phone');
  await b.size(1366, 768); await b.click('Activity log', 1800); const log = await b.text(); await shot('15-activity');
  check('the activity log says what happened, in rupees', !/undefined|NaN/.test(log) && log.includes('paid a supplier') && log.includes('Sri Balaji Dairy · ₹100'), log.slice(-400));
  check('no page errors', b.errors.length === 0, b.errors);
} finally { b.close(); await sleep(200); }
console.log(`\n${pass} passed, ${failed.length} failed`);
if (failed.length) { console.log(failed.map(f => '  - ' + f).join('\n')); process.exit(1); }
process.exit(0);

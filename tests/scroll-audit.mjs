// Scroll audit: every role, every staff tab (+ super admin pages), at laptop and phone sizes.
// Needs the app running (demo data) and Microsoft Edge. Run: npm run test:scroll  → report + screenshots of problems in .data/scroll-audit/
// For each screen: can the page scroll to its end? Is anything in the side menu cut off and unreachable?
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:3001';
const OUT = process.argv[2] || '.data/scroll-audit';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9336;
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function login(phone) {
  const r = await fetch(`${BASE}/api/staff/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, pin: '1234' }) });
  return r.headers.getSetCookie().map(c => c.split(';')[0]).find(c => c.startsWith('sv_s=')).slice(5);
}

const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(OUT, '..', 'edge-prof4')}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
let ws;
for (let i = 0; i < 40; i++) { try { const j = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const p = j.find(x => x.type === 'page'); if (p) { ws = p.webSocketDebuggerUrl; break; } } catch { /* starting */ } await sleep(250); }
const sock = new WebSocket(ws);
await new Promise(r => sock.addEventListener('open', r));
let id = 0; const wait = new Map(); const errors = [];
sock.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
const js = async expr => (await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const shot = async name => { const r = await cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64')); };
const go = async (url, ms) => { await cmd('Page.navigate', { url }); await sleep(ms); };

// Measures one screen. Scrolls everything to the end and checks the last content is really visible.
const MEASURE = `(async () => {
  const out = [];
  const se = document.scrollingElement;
  const vh = innerHeight;
  // 1. Whole page: if taller than the window, it must actually scroll.
  if (se.scrollHeight > vh + 4) {
    scrollTo(0, se.scrollHeight); await new Promise(r => setTimeout(r, 150));
    if (scrollY + vh < se.scrollHeight - 4) out.push('page does not scroll to the end (' + Math.round(scrollY + vh) + ' of ' + se.scrollHeight + 'px)');
    scrollTo(0, 0);
  }
  if (getComputedStyle(document.body).overflow === 'hidden') out.push('body scrolling is locked');
  // 2. Any box whose content is taller than itself but cannot scroll (content cut off).
  for (const el of document.querySelectorAll('aside, nav, main, section, div, ul')) {
    const cs = getComputedStyle(el);
    if (el.clientHeight < 40 || cs.display === 'none' || cs.visibility === 'hidden') continue;
    const over = el.scrollHeight - el.clientHeight;
    if (over > 6 && !/(auto|scroll)/.test(cs.overflowY) && cs.overflowY !== 'visible') {
      out.push('cut off, cannot scroll: <' + el.tagName.toLowerCase() + ' class="' + String(el.className).slice(0, 70) + '"> hides ' + over + 'px');
    }
    // A fixed/sticky full-height column whose content overflows the screen (visible overflow but stuck to the viewport).
    if (/(sticky|fixed)/.test(cs.position) && el.clientHeight >= vh - 2 && el.scrollHeight > vh + 6 && !/(auto|scroll)/.test(cs.overflowY)) {
      out.push('stuck column taller than the screen: <' + el.tagName.toLowerCase() + ' class="' + String(el.className).slice(0, 70) + '"> needs ' + el.scrollHeight + 'px of ' + vh);
    }
  }
  // 3. Side menu: is every menu button reachable inside the window?
  const aside = document.querySelector('aside');
  if (aside && /(sticky|fixed)/.test(getComputedStyle(aside).position)) {
    for (const b of aside.querySelectorAll('button, a')) {
      const r = b.getBoundingClientRect();
      if (r.height && r.bottom > vh + 1 && !/(auto|scroll)/.test(getComputedStyle(b.closest('nav') || aside).overflowY) && !/(auto|scroll)/.test(getComputedStyle(aside).overflowY)) {
        out.push('menu item unreachable: "' + b.innerText.trim().split('\\n')[0] + '" at ' + Math.round(r.bottom) + 'px of ' + vh); break;
      }
    }
  }
  return [...new Set(out)];
})()`;

const roles = [
  ['owner', '9000000002', 'Spice Route owner'], ['cashier', '9000000024', 'Spice Route cashier'], ['captain', '9000000021', 'Spice Route captain'],
  ['station', '9000000022', 'Spice Route kitchen'], ['runner', '9000000014', 'Aurora runner'], ['owner', '9000000001', 'Aurora (theater) owner'],
];
const sizes = [[1366, 768, false], [1440, 900, false], [390, 844, true]];
const report = [];
for (const [w, h, mobile] of sizes) {
  await cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  for (const [role, phone, who] of roles) {
    await cmd('Network.clearBrowserCookies');
    await cmd('Network.setCookie', { name: 'sv_s', value: await login(phone), url: BASE });
    await go(`${BASE}/staff/login`, 800);
    await js(`localStorage.clear()`);
    await go(`${BASE}/staff`, 3500);
    const tabs = await js(`[...document.querySelectorAll('aside nav button')].map(b => b.innerText.trim().split('\\n')[0])`) || [];
    for (const t of tabs) {
      await js(`[...document.querySelectorAll('aside nav button')].find(b => b.innerText.trim().startsWith(${JSON.stringify(t)}))?.click()`);
      await sleep(2200);
      const issues = await js(MEASURE) || ['(could not measure)'];
      const line = `${w}x${h} · ${who} · ${t}: ${issues.length ? issues.join(' | ') : 'OK'}`;
      report.push(line);
      if (issues.length) { console.log('✗ ' + line); await shot(`scroll-${w}-${role}-${who.split(' ')[0]}-${t.replace(/\W+/g, '_')}`); }
    }
  }
  // Super admin
  await cmd('Network.clearBrowserCookies');
  await cmd('Network.setCookie', { name: 'sv_s', value: await login('9000000000'), url: BASE });
  for (const t of ['overview', 'leads', 'vendors', 'billing', 'customers', 'support', 'activity', 'onboard']) {
    await go(`${BASE}/admin?tab=${t}`, 2500);
    const issues = await js(MEASURE) || ['(could not measure)'];
    const line = `${w}x${h} · super admin · ${t}: ${issues.length ? issues.join(' | ') : 'OK'}`;
    report.push(line);
    if (issues.length) { console.log('✗ ' + line); await shot(`scroll-${w}-admin-${t}`); }
  }
}
fs.writeFileSync(path.join(OUT, 'scroll-report.txt'), report.join('\n'));
console.log(`\nChecked ${report.length} screens, ${report.filter(l => !l.endsWith('OK')).length} with problems. JS errors: ${errors.length ? [...new Set(errors)].join(' / ') : 'none'}`);
sock.close(); edge.kill(); process.exit(report.some(l => !l.endsWith('OK')) ? 1 : 0);

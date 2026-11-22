// Small helper to drive Microsoft Edge (headless) over the DevTools protocol, for tests that must see the real screen.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EDGE = process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function openBrowser({ port = 9350, width = 1366, height = 768, mobile = false } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'servd-edge-'));
  const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 60 && !ws; i++) {
    try { ws = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(x => x.type === 'page')?.webSocketDebuggerUrl; } catch { /* starting */ }
    if (!ws) await sleep(250);
  }
  if (!ws) { edge.kill(); throw new Error(`Edge did not start (${EDGE})`); }
  const sock = new WebSocket(ws);
  await new Promise(r => sock.addEventListener('open', r));
  let id = 0;
  const wait = new Map(), errors = [];
  sock.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  });
  const cmd = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
  const js = async expression => (await cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const size = (w, h, m = false) => cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: m });
  await cmd('Page.enable'); await cmd('Runtime.enable'); await size(width, height, mobile);
  return {
    cmd, js, size, errors,
    cookie: (name, value, url) => cmd('Network.setCookie', { name, value, url }),
    clearCookies: () => cmd('Network.clearBrowserCookies'),
    go: async (url, ms = 2500) => { await cmd('Page.navigate', { url }); await sleep(ms); },
    text: () => js('document.body.innerText'),
    /** Click the first visible button / link whose text starts with `t`. */
    click: async (t, ms = 500) => {
      const ok = await js(`(() => { const b = [...document.querySelectorAll('button, a, [role=button]')].filter(x => x.offsetParent !== null).find(x => x.innerText.trim().startsWith(${JSON.stringify(t)})); if (b) b.click(); return !!b; })()`);
      await sleep(ms);
      return ok;
    },
    waitFor: async (t, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (((await js('document.body.innerText')) || '').includes(t)) return true; await sleep(250); } return false; },
    shot: async file => { const r = await cmd('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); },
    close: () => { sock.close(); edge.kill(); },
  };
}

export async function staffToken(base, phone, pin = '1234') {
  const r = await fetch(`${base}/api/staff/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, pin }) });
  const c = r.headers.getSetCookie().map(x => x.split(';')[0]).find(x => x.startsWith('sv_s='));
  if (!c) throw new Error(`Login failed for ${phone}`);
  return c.slice(5);
}

// Demo-for-pitches test: create / refresh / remove the demo vendors, and check they are marked and kept out of real numbers.
// Needs the app in testing mode on this PC: EMAIL_PROVIDER=off npm start   then   npm run test:demo
// It ends by making a fresh demo again with PIN 1234 (the local default), so other tests keep working.

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
}
const staffLogin = async (phone: string, pin: string) => { const c = new Client(); const r = await c.post('/api/staff/login', { phone, pin }); return { c, ok: r.status === 200 }; };

async function main() {
  console.log(`Servd demo test against ${BASE}`);
  const admin = new Client();
  check('super admin logs in', (await admin.post('/api/staff/login', { phone: '9000000000', pin: '1234' })).json?.role === 'super_admin');

  section('Demo vendors are listed and marked');
  let demo = (await admin.get('/api/admin/demo')).json;
  if (!demo?.vendors?.length) { await admin.post('/api/admin/demo', { action: 'create', pin: '1234' }); demo = (await admin.get('/api/admin/demo')).json; }
  check('4 demo vendors (theater, restaurant, café, stall)', demo?.vendors?.length === 4, demo?.vendors?.map((v: any) => v.name));
  check('each has a guest QR picture and link', demo.vendors.every((v: any) => v.venues[0]?.qr?.png?.startsWith('data:image/png') && v.venues[0].qr.url.includes('/q/')));
  check('each lists its demo logins', demo.vendors.every((v: any) => v.logins.length >= 2));
  const list = (await admin.get('/api/admin/vendors')).json.vendors;
  check('vendor list marks them as demo', list.filter((v: any) => v.isDemo).length === 4);
  check('another “create” is refused while they exist', (await admin.post('/api/admin/demo', { action: 'create', pin: '1234' })).status === 400);
  check('a bad PIN is refused', (await admin.post('/api/admin/demo', { action: 'refresh', pin: '12' })).status === 400);
  check('only the super admin can manage the demo', (await (await staffLogin('9000000002', '1234')).c.post('/api/admin/demo', { action: 'remove' })).status === 403);

  section('Kept out of real numbers');
  const ov = (await admin.get('/api/admin/overview')).json, ovAll = (await admin.get('/api/admin/overview?demo=1')).json;
  const demoVenues = demo.vendors.flatMap((v: any) => v.venues.map((x: any) => x.id));
  check('overview leaves demo out by default and says so', ov.demo.vendors === 4 && ov.demo.included === false && ovAll.demo.included === true);
  check('top venues have no demo venue', !ov.top.some((t: any) => demoVenues.includes(t.venueId)));
  check('with demo switched on, the totals include it', ovAll.kpi.month.orders > ov.kpi.month.orders, { real: ov.kpi.month.orders, all: ovAll.kpi.month.orders });
  check('vendor counts leave demo out', ovAll.kpi.vendors.total - ov.kpi.vendors.total === 4);
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()).slice(0, 7);
  const bl = (await admin.get(`/api/admin/billing?month=${month}`)).json;
  check('demo vendors are never billed', !bl.rows.some((r: any) => demo.vendors.some((v: any) => v.id === r.vendorId)));

  section('Marked where owners and guests see it');
  const owner = await staffLogin('9000000002', '1234');
  const me = (await owner.c.get('/api/staff/me')).json;
  check('staff app knows it is a demo venue', me?.venues?.[0]?.vendor?.isDemo === true);
  const guest = new Client();
  const scan = (await guest.post('/api/scan', { code: demo.vendors[1].venues[0].code })).json;
  check('guest menu knows it is a demo venue', scan?.vendor?.isDemo === true);
  const live = (await owner.c.get(`/api/staff/v/${me.venues[0].id}/live`)).json;
  const paidOrder = live.orders.find((o: any) => o.payStatus === 'paid');
  const bill = paidOrder ? await owner.c.get(`/print/invoice/${paidOrder.id}`) : null;
  check('printed bill says SAMPLE, not a valid tax invoice', bill?.text.includes('SAMPLE BILL (DEMO)') && !bill.text.includes('>TAX INVOICE<'), paidOrder ? bill?.text.match(/SAMPLE[^<]*/)?.[0] : 'no paid order today');
  check('Z report says demo data', (await owner.c.get(`/print/day/${me.venues[0].id}`)).text.includes('DEMO DATA'));

  section('Refresh with a new PIN (before a pitch)');
  const oldIds = demo.vendors.map((v: any) => v.id);
  const t0 = Date.now();
  const rf = await admin.post('/api/admin/demo', { action: 'refresh', pin: '4321' });
  const secs = (Date.now() - t0) / 1000;
  console.log(`    (refresh took ${secs.toFixed(1)} s on this PC)`);
  check('refresh works', rf.status === 200 && rf.json.vendors.length === 4, rf.json);
  check('demo vendors are brand new', rf.json.vendors.every((v: any) => !oldIds.includes(v.id)));
  check('demo logins use the new PIN', (await staffLogin('9000000002', '4321')).ok && !(await staffLogin('9000000002', '1234')).ok);
  const restaurant = rf.json.vendors.find((v: any) => v.venues[0].type === 'restaurant');
  const u = (await admin.get(`/api/admin/vendors/${restaurant.id}`)).json.venues[0].usage;
  check('fresh sample orders look real: guest QR, counter and Zomato', u.qr.orders > 50 && u.counter.orders > 5 && u.apps.orders > 0, u);
  check('sample orders run up to today', rf.json.vendors.every((v: any) => v.venues[0].orders > 50 && Date.now() - new Date(v.venues[0].lastOrderAt).getTime() < 26 * 3600e3));

  section('Remove, then create again');
  const realBefore = (await admin.get('/api/admin/vendors')).json.vendors.filter((v: any) => !v.isDemo).length;
  check('remove works', (await admin.post('/api/admin/demo', { action: 'remove' })).json?.vendors?.length === 0);
  check('real vendors are untouched', (await admin.get('/api/admin/vendors')).json.vendors.length === realBefore);
  check('demo logins are gone', !(await staffLogin('9000000002', '4321')).ok);
  check('sample customers are gone', !((await admin.get('/api/admin/customers?q=8110')).json?.customers || []).some((c: any) => /^81/.test(c.phone)));
  const t1 = Date.now();
  check('create again with PIN 1234', (await admin.post('/api/admin/demo', { action: 'create', pin: '1234' })).json?.vendors?.length === 4);
  console.log(`    (create took ${((Date.now() - t1) / 1000).toFixed(1)} s on this PC)`);
  check('demo logins work with 1234 again', (await staffLogin('9000000002', '1234')).ok);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFailed:\n' + failures.map(f => '  - ' + f).join('\n')); process.exit(1); }
}
main().catch(e => { console.error(e); process.exit(1); });
export {};

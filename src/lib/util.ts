import crypto from 'node:crypto';

export const TZ = 'Asia/Kolkata';

const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
export function randomCode(n = 8) {
  const b = crypto.randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHA[b[i] % ALPHA.length];
  return s;
}
export const newToken = () => crypto.randomBytes(32).toString('hex');

export function hashPin(pin: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pin, salt, 32).toString('hex');
}
export function checkPin(pin: string, stored: string) {
  const [salt, hash] = stored.split(':');
  const h = crypto.scryptSync(pin, salt, 32);
  return crypto.timingSafeEqual(h, Buffer.from(hash, 'hex'));
}

export function cleanPhone(p: unknown) {
  const d = String(p ?? '').replace(/\D/g, '').slice(-10);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

// Local (India) date and minutes-since-midnight, independent of the server's timezone.
export function localParts(at = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(at).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
export const hhmmToMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'venue';
}

// "A-J" -> [A..J]; "A,B,C" -> [A,B,C]
export function parseRows(spec: string | null | undefined) {
  const s = String(spec || '').toUpperCase().replace(/\s/g, '');
  const m = s.match(/^([A-Z])-([A-Z])$/);
  if (m) {
    const out: string[] = [];
    for (let c = m[1].charCodeAt(0); c <= m[2].charCodeAt(0); c++) out.push(String.fromCharCode(c));
    return out;
  }
  return s.split(',').filter(Boolean);
}

'use client';
// Browser helpers: API calls, money formatting, live updates.
import { useEffect, useRef } from 'react';

export class ApiFail extends Error { constructor(msg: string, public status: number, public code?: string) { super(msg); } }

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const r = await fetch(path, {
    method: opts.method || (opts.body || opts.form ? 'POST' : 'GET'),
    headers: opts.form ? undefined : { 'Content-Type': 'application/json' },
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    credentials: 'same-origin',
  });
  let data: any = null;
  try { data = await r.json(); } catch { /* empty */ }
  if (!r.ok) throw new ApiFail(data?.error || 'Something went wrong. Check your connection and try again.', r.status, data?.code);
  return data as T;
}

export const rupee = (paise: number) => {
  const r = paise / 100;
  return '₹' + r.toLocaleString('en-IN', Number.isInteger(r) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
export const rupeeShort = (paise: number) => {
  const r = paise / 100;
  if (r >= 1e7) return '₹' + (r / 1e7).toFixed(1) + 'Cr';
  if (r >= 1e5) return '₹' + (r / 1e5).toFixed(1) + 'L';
  if (r >= 1e3) return '₹' + (r / 1e3).toFixed(1) + 'k';
  return '₹' + Math.round(r);
};

export function timeAgo(ts: string | Date) {
  const s = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
export const clock = (ts: string | Date) => new Date(ts).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
export const hhmm = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
export const minsSince = (ts: string | Date) => Math.floor((Date.now() - new Date(ts).getTime()) / 60000);

export const store = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* */ } },
};

// ---------------------------------------------------------------- live updates
// One shared listener per page. It asks the server for a pass to the rooms all mounted components need,
// then checks for new events every 1.5 s (5 s when the tab is hidden) and hands each event to the components
// listening to that room. Works on any host, including Vercel.
type Sub = { rooms: string[]; handlers: { current: Record<string, (data: any) => void> }; onStatus?: (live: boolean) => void };
const subs = new Set<Sub>();
const rt = { token: '', key: '', cursor: 0, timer: 0 as unknown as ReturnType<typeof setTimeout>, busy: false, live: false };

function wanted() { return [...new Set([...subs].flatMap(s => s.rooms))].sort(); }
function setLive(v: boolean) { if (rt.live !== v) { rt.live = v; subs.forEach(s => s.onStatus?.(v)); } }

async function rtTick() {
  clearTimeout(rt.timer);
  if (!subs.size) { rt.key = ''; rt.token = ''; return; }
  if (rt.busy) return;
  rt.busy = true;
  try {
    const rooms = wanted(), key = rooms.join('|');
    if (key !== rt.key || !rt.token) {
      const j = await api<{ token: string; cursor: number }>('/api/rt/join', { body: { rooms } });
      rt.token = j.token; rt.key = key; if (!rt.cursor) rt.cursor = j.cursor;
    }
    const r = await fetch(`/api/rt?t=${encodeURIComponent(rt.token)}&since=${rt.cursor}`, { credentials: 'same-origin', cache: 'no-store' });
    if (r.status === 401) { rt.token = ''; throw new Error('rejoin'); }
    if (!r.ok) throw new Error(String(r.status));
    const d: { events: { id: number; rooms: string[]; event: string; data: unknown }[]; cursor: number } = await r.json();
    rt.cursor = Math.max(rt.cursor, d.cursor);
    for (const ev of d.events) for (const s of subs) if (ev.rooms.some(x => s.rooms.includes(x))) { try { s.handlers.current[ev.event]?.(ev.data); } catch (e) { console.error(e); } }
    setLive(true);
  } catch { setLive(false); }
  finally {
    rt.busy = false;
    if (subs.size) rt.timer = setTimeout(rtTick, typeof document !== 'undefined' && document.hidden ? 5000 : 1500);
  }
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden && subs.size) rtTick(); });

/** Listen to live rooms, e.g. useRealtime([`order:${id}`], { order: m => … }). */
export function useRealtime(rooms: string[], handlers: Record<string, (data: any) => void>, onStatus?: (live: boolean) => void) {
  const ref = useRef(handlers);
  ref.current = handlers;
  const key = rooms.filter(Boolean).sort().join('|');
  useEffect(() => {
    if (!key) return;
    const sub: Sub = { rooms: key.split('|'), handlers: ref, onStatus };
    subs.add(sub);
    if (rt.live) onStatus?.(true);
    rt.timer && clearTimeout(rt.timer);
    rt.timer = setTimeout(rtTick, 50);   // join the new rooms right away
    return () => { subs.delete(sub); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/**
 * Shrink a photo in the browser before uploading (a 3 MB phone photo becomes ~100–250 KB), so menus load fast.
 * Logos keep transparency (PNG); photos become JPEG. Small images are sent as they are.
 */
export async function shrinkImage(file: File, maxSide = 1200): Promise<File> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 300 * 1024) { bmp.close(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, type, 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, type === 'image/png' ? '.png' : '.jpg'), { type });
  } catch { return file; }
}

/** Print a page without leaving the screen. */
export function printQuietly(url: string) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  f.src = url;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 60000);
}

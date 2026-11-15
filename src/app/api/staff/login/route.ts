import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { ApiError, bad, body, route } from '@/lib/api';
import { createSession } from '@/lib/auth';
import { checkPin, cleanPhone } from '@/lib/util';

const fails = new Map<string, number[]>();

export const POST = route(async req => {
  const b = await body<{ phone: string; pin: string }>(req);
  const phone = cleanPhone(b.phone);
  if (!phone || !/^\d{4,6}$/.test(String(b.pin || ''))) throw bad('Enter your phone number and 4–6 digit PIN.');
  const recent = (fails.get(phone) || []).filter(t => Date.now() - t < 15 * 60e3);
  if (recent.length >= 8) throw new ApiError(429, 'Too many wrong PINs. Wait 15 minutes or ask the owner to reset your PIN.');
  const s = (await db().select().from(schema.staff).where(eq(schema.staff.phone, phone)))[0];
  if (!s || !s.active || !checkPin(String(b.pin), s.pinHash)) {
    fails.set(phone, [...recent, Date.now()]);
    throw bad('Wrong phone number or PIN.');
  }
  fails.delete(phone);
  await createSession('staff', s.id);
  return { role: s.role };
});

import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { ApiError, bad, body, route } from '@/lib/api';
import { createSession } from '@/lib/auth';
import { cleanPhone } from '@/lib/util';

// Login step 2: check the code. The email it was sent to becomes (or stays) the customer's verified email.
export const POST = route(async req => {
  const b = await body<{ phone?: string; email?: string; otp: string; name?: string }>(req);
  let phone = b.phone ? cleanPhone(b.phone) : null;
  if (!phone && b.email) {
    const c = (await db().select({ phone: schema.customers.phone }).from(schema.customers)
      .where(sql`lower(${schema.customers.email}) = ${String(b.email).trim().toLowerCase()}`))[0];
    phone = c?.phone ?? null;
  }
  if (!phone) throw bad('Start again: enter your mobile number');

  const rec = (await db().select().from(schema.otps).where(eq(schema.otps.phone, phone)))[0];
  if (!rec || rec.expiresAt < new Date()) throw bad('This code has expired. Tap "Resend code".');
  if (rec.tries >= 5) throw new ApiError(429, 'Too many wrong attempts. Tap "Resend code" for a new one.');
  if (String(b.otp ?? '').trim() !== rec.code) {
    await db().update(schema.otps).set({ tries: rec.tries + 1 }).where(eq(schema.otps.phone, phone));
    throw bad('Wrong code. Check the email and try again.');
  }
  await db().delete(schema.otps).where(eq(schema.otps.phone, phone));

  const name = String(b.name || '').trim().slice(0, 40);
  let c = (await db().select().from(schema.customers).where(eq(schema.customers.phone, phone)))[0];
  try {
    if (!c) c = (await db().insert(schema.customers).values({ phone, name, email: rec.email }).returning())[0];
    else if (!c.email || (name && !c.name)) {
      c = (await db().update(schema.customers).set({ email: c.email || rec.email, name: c.name || name })
        .where(eq(schema.customers.id, c.id)).returning())[0];
    }
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string } };
    if (err.code === '23505' || err.cause?.code === '23505') throw bad('This email is already linked to another mobile number.', 'email_taken');
    throw e;
  }
  await createSession('customer', c.id);
  return { customer: { name: c.name, phone: c.phone, email: c.email } };
});

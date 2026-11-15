import { after } from 'next/server';
import { randomInt } from 'node:crypto';
import { and, eq, gt, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { ApiError, bad, body, route } from '@/lib/api';
import { cleanPhone } from '@/lib/util';
import { emailTestMode, isEmail, maskEmail, otpEmail, sendEmail } from '@/lib/email';

const VALID_MIN = 10;      // an emailed code works for 10 minutes
const RESEND_SEC = 30;     // wait between two codes for the same phone or email

const customerByEmail = async (email: string) =>
  (await db().select().from(schema.customers).where(sql`lower(${schema.customers.email}) = ${email.toLowerCase()}`))[0];

// Login step 1. The customer types their phone number (or their email).
// - Known customer: the code goes to the email we already have. They never type it again.
// - New customer (or no email on file): we answer { needEmail } and the screen asks for it once.
// - "Log in with email": a known email gets the code; an unknown email answers { needPhone }.
// While no email service is configured (testing mode) the code is also returned so the screen can show it.
export const POST = route(async req => {
  const b = await body<{ phone?: string; email?: string }>(req);
  const typedEmail = String(b.email ?? '').trim().toLowerCase();
  if (typedEmail && !isEmail(typedEmail)) throw bad('Enter a valid email address');

  let phone: string | null;
  let target: string;
  let isNew = false;

  if (b.phone) {
    phone = cleanPhone(b.phone);
    if (!phone) throw bad('Enter a valid 10-digit mobile number');
    const c = (await db().select().from(schema.customers).where(eq(schema.customers.phone, phone)))[0];
    if (c?.email) target = c.email;
    else {
      if (!typedEmail) return { needEmail: true };
      const other = await customerByEmail(typedEmail);
      if (other && other.id !== c?.id) throw bad('This email is already linked to another mobile number. Use "Log in with email" instead.', 'email_taken');
      target = typedEmail;
      isNew = !c;
    }
  } else {
    if (!typedEmail) throw bad('Enter your mobile number');
    const c = await customerByEmail(typedEmail);
    if (!c) return { needPhone: true };
    phone = c.phone;
    target = c.email;
  }

  // Slow down repeated requests, so nobody can flood someone's inbox.
  const since = new Date(Date.now() - RESEND_SEC * 1000);
  const recent = await db().select({ sentAt: schema.otps.sentAt }).from(schema.otps)
    .where(and(gt(schema.otps.sentAt, since), sql`(${schema.otps.phone} = ${phone} OR lower(${schema.otps.email}) = ${target.toLowerCase()})`));
  if (recent.length) {
    const wait = Math.max(1, Math.ceil((recent[0].sentAt.getTime() + RESEND_SEC * 1000 - Date.now()) / 1000));
    throw new ApiError(429, `Please wait ${wait} seconds before asking for a new code.`, 'wait');
  }

  const code = String(randomInt(100000, 1000000));
  const now = new Date();
  const row = { email: target, code, tries: 0, sentAt: now, expiresAt: new Date(now.getTime() + VALID_MIN * 60e3) };
  await db().insert(schema.otps).values({ phone, ...row }).onConflictDoUpdate({ target: schema.otps.phone, set: row });

  // Send the email in the background, so the "enter code" screen appears instantly
  // (talking to Gmail takes 2–6 s). Vercel keeps the function alive until it's sent.
  // If sending fails, the customer taps "Resend code" (allowed after 30 s).
  const mail = { to: target, ...otpEmail(code, VALID_MIN) };
  after(() => sendEmail(mail).catch(e => console.error(`[OTP] email to ${maskEmail(target)} failed:`, (e as Error).message)));
  const test = emailTestMode();
  if (test) console.log(`[OTP] ${phone} → ${target}: ${code}`);
  return { ok: true, sentTo: maskEmail(target), isNew, resendAfter: RESEND_SEC, ...(test ? { devOtp: code } : {}) };
});

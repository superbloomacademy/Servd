// Sends emails (for now: login OTPs). Chosen with EMAIL_PROVIDER in .env (or in Vercel's settings):
//
//   gmail  – sent from our own Gmail / Google Workspace mailbox (recommended for the pilot, free).
//            EMAIL_FROM=superbloomacademy@gmail.com   EMAIL_PASSWORD=<16-letter Google "App password">
//   smtp   – any other mailbox: SMTP_HOST, SMTP_PORT (465 or 587), EMAIL_FROM, EMAIL_PASSWORD (SMTP_USER if different)
//   brevo / resend – email services: EMAIL_API_KEY, EMAIL_FROM
//   (empty) – TESTING MODE: nothing is sent and the OTP is shown on screen.
//
// EMAIL_FROM_NAME is the name people see, e.g. "Servd".
import nodemailer from 'nodemailer';
import { db, schema } from '@/db';

/** Plain-language reason for a mail-server refusal (shown to the super admin). */
export function emailFailureReason(msg: string) {
  if (/534|WebLoginRequired|5.7.9/.test(msg)) return 'Google blocked the sign-in. Log in to the Gmail account in a browser, clear any security check, then make a new App Password.';
  if (/535|Username and Password not accepted|BadCredentials/.test(msg)) return 'Gmail rejected the App Password. Make a new App Password and update EMAIL_PASSWORD.';
  if (/550|554|quota|limit/i.test(msg)) return 'Gmail stopped sending (daily limit or spam check). Wait a few hours, or check the Gmail account.';
  if (/ETIMEDOUT|ECONNECTION|ESOCKET|timeout/i.test(msg)) return 'Could not reach the mail server (network). It usually recovers by itself.';
  return 'The mail server refused the email.';
}

// Every failure is written to the activity log, so the super admin sees it on the Overview instead of guests silently getting nothing.
async function recordFailure(provider: string, msg: string) {
  try { await db().insert(schema.auditLog).values({ action: 'email_failed', entity: 'email', staffName: 'system', after: { provider, error: msg.slice(0, 300), reason: emailFailureReason(msg) } }); }
  catch { /* never let logging break sending */ }
}

type Cfg =
  | { provider: 'brevo' | 'resend'; key: string; from: string; fromName: string }
  | { provider: 'smtp'; host: string; port: number; user: string; pass: string; from: string; fromName: string };

function config(): Cfg | null {
  const provider = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  const from = (process.env.EMAIL_FROM || '').trim();
  const fromName = (process.env.EMAIL_FROM_NAME || 'Servd').trim();
  if (!from) return null;
  if (provider === 'brevo' || provider === 'resend') {
    const key = (process.env.EMAIL_API_KEY || '').trim();
    return key ? { provider, key, from, fromName } : null;
  }
  if (provider === 'gmail' || provider === 'smtp') {
    const pass = (process.env.EMAIL_PASSWORD || '').replace(/\s/g, '');   // Google shows app passwords with spaces
    if (!pass) return null;
    const host = provider === 'gmail' ? 'smtp.gmail.com' : (process.env.SMTP_HOST || '').trim();
    const port = provider === 'gmail' ? 465 : Number(process.env.SMTP_PORT || 465);
    return host ? { provider: 'smtp', host, port, user: (process.env.SMTP_USER || from).trim(), pass, from, fromName } : null;
  }
  return null;
}

/** True when no email service is configured, so OTPs are shown on screen instead. */
export const emailTestMode = () => config() === null;

export const isEmail = (e: unknown) => {
  const s = String(e ?? '').trim();
  return s.length <= 80 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
};

/** "yashwanth@gmail.com" → "ya•••••••@gmail.com" */
export function maskEmail(e: string) {
  const [user, domain] = e.split('@');
  const keep = user.length <= 2 ? 1 : 2;
  return `${user.slice(0, keep)}${'•'.repeat(Math.max(3, user.length - keep))}@${domain}`;
}

type Mail = { to: string; subject: string; html: string; text: string };

// One reusable mail connection per server instance (keeps sending fast).
const g = globalThis as unknown as { __servdMail?: { key: string; t: nodemailer.Transporter } };
function transport(c: Extract<Cfg, { provider: 'smtp' }>) {
  const key = `${c.host}:${c.port}:${c.user}`;
  if (g.__servdMail?.key !== key) {
    g.__servdMail = { key, t: nodemailer.createTransport({
      host: c.host, port: c.port, secure: c.port === 465, auth: { user: c.user, pass: c.pass },
      pool: true, maxConnections: 2, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000,
    }) };
  }
  return g.__servdMail.t;
}

export async function sendEmail(m: Mail) {
  const c = config();
  if (!c) { console.log(`[email · testing mode] to ${m.to}: ${m.subject}`); return; }
  if (c.provider === 'smtp') {
    try { await transport(c).sendMail({ from: { name: c.fromName, address: c.from }, to: m.to, subject: m.subject, html: m.html, text: m.text }); }
    catch (e) { console.error('[email] mail server refused the email:', (e as Error).message); g.__servdMail = undefined; await recordFailure('gmail/smtp', (e as Error).message); throw new Error('email_failed'); }
    return;
  }
  const res = c.provider === 'brevo'
    ? await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': c.key, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: { name: c.fromName, email: c.from }, to: [{ email: m.to }], subject: m.subject, htmlContent: m.html, textContent: m.text }),
      })
    : await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${c.key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: `${c.fromName} <${c.from}>`, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
      });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    console.error(`[email] ${c.provider} refused the email (${res.status}):`, body);
    await recordFailure(c.provider, `${res.status} ${body}`);
    throw new Error('email_failed');
  }
}

export function otpEmail(code: string, minutes: number): Omit<Mail, 'to'> {
  const brand = process.env.EMAIL_FROM_NAME || 'Servd';
  return {
    subject: `${code} is your ${brand} login code`,
    text: `Your ${brand} login code is ${code}. It works for ${minutes} minutes. Don't share it with anyone, including staff. If you didn't ask for this code, ignore this email.`,
    html: `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#1c1c1c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;background:#ffffff;border-radius:16px;padding:32px 28px">
<tr><td style="font-size:20px;font-weight:800;letter-spacing:-0.3px">${brand}</td></tr>
<tr><td style="padding-top:20px;font-size:15px;line-height:22px">Here is your login code:</td></tr>
<tr><td style="padding:14px 0 6px"><div style="display:inline-block;background:#f4f4f5;border-radius:12px;padding:14px 22px;font-size:32px;font-weight:800;letter-spacing:8px">${code}</div></td></tr>
<tr><td style="font-size:13px;line-height:20px;color:#6b6b6b">It works for ${minutes} minutes. Don't share it with anyone, including venue staff.<br>If you didn't ask for this code, you can ignore this email.</td></tr>
</table>
<p style="font-size:12px;color:#9a9a9a;margin-top:16px">Sent because someone entered this email to log in to ${brand}.</p>
</td></tr></table></body></html>`,
  };
}

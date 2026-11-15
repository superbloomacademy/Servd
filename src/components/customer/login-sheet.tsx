'use client';
import { useEffect, useState } from 'react';
import { Mail, Smartphone } from 'lucide-react';
import { Sheet, Btn, inputCls } from '@/components/ui/kit';
import { api, ApiFail } from '@/lib/client';

// Login: the customer types their mobile number; the OTP goes to their EMAIL (free, until SMS is added).
//  - First time: we ask for their email once (and an optional name).
//  - Next time: number only. The code goes to the email we already have.
//  - "Log in with email instead" works the other way round.
// In testing mode (no email service set up yet) the code is also shown on screen.
type Step = 'start' | 'addEmail' | 'addPhone' | 'otp';
type OtpRes = { needEmail?: boolean; needPhone?: boolean; sentTo?: string; isNew?: boolean; devOtp?: string; resendAfter?: number };

export function LoginSheet({ open, onClose, onDone, reason }: { open: boolean; onClose: () => void; onDone: (c: { name: string; phone: string }) => void; reason?: string }) {
  const [mode, setMode] = useState<'phone' | 'email'>('phone');
  const [step, setStep] = useState<Step>('start');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState<{ to: string; isNew: boolean; devOtp?: string }>({ to: '', isNew: false });
  const [wait, setWait] = useState(0);
  const [err, setErr] = useState<{ msg: string; code?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const fail = (e: unknown) => setErr({ msg: (e as Error).message, code: e instanceof ApiFail ? e.code : undefined });
  const restart = (m: 'phone' | 'email' = mode) => { setMode(m); setStep('start'); setOtp(''); setErr(null); };

  // Which details we send depends on the path: phone only, phone + email, email only.
  const send = async (payload: { phone?: string; email?: string }) => {
    setErr(null); setBusy(true);
    try {
      const r = await api<OtpRes>('/api/auth/otp', { body: payload });
      if (r.needEmail) { setStep('addEmail'); return; }
      if (r.needPhone) { setStep('addPhone'); return; }
      setSent({ to: r.sentTo || '', isNew: !!r.isNew, devOtp: r.devOtp });
      setWait(r.resendAfter || 30); setOtp(''); setStep('otp');
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const payload = () => (mode === 'email' && step !== 'addPhone' && !phone ? { email } : { phone, ...(email ? { email } : {}) });

  const verify = async () => {
    setErr(null); setBusy(true);
    try {
      const r = await api('/api/auth/verify', { body: { ...(phone ? { phone } : { email }), otp, name } });
      restart('phone'); setPhone(''); setEmail(''); setName('');
      onDone(r.customer);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const phoneInput = (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Mobile number</span>
      <div className="flex items-center rounded-xl border border-line focus-within:border-ink">
        <span className="border-r border-line px-3 py-2.5 text-[15px] text-muted">+91</span>
        <input autoFocus inputMode="numeric" autoComplete="tel-national" maxLength={10} value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
          className="w-full rounded-r-xl px-3 py-2.5 text-[15px] tracking-wide outline-none" placeholder="98765 43210" />
      </div>
    </label>
  );
  const emailInput = (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Email</span>
      <input autoFocus type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={80}
        value={email} onChange={e => setEmail(e.target.value.trim())} className={inputCls} placeholder="you@gmail.com" />
    </label>
  );
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  const errorBox = err && (
    <div className="space-y-1 text-sm text-bad">
      <p>{err.msg}</p>
      {err.code === 'email_taken' && <button type="button" className="font-semibold text-brand-text" onClick={() => { setPhone(''); restart('email'); }}>Log in with email instead</button>}
    </div>
  );
  const switchLink = (
    <button type="button" onClick={() => { setPhone(''); setEmail(''); restart(mode === 'phone' ? 'email' : 'phone'); }}
      className="flex w-full items-center justify-center gap-1.5 py-1 text-[13px] font-semibold text-ink-2 hover:text-ink">
      {mode === 'phone' ? <><Mail size={15} />Log in with email instead</> : <><Smartphone size={15} />Log in with mobile number instead</>}
    </button>
  );
  const title = step === 'otp' ? 'Enter the code' : step === 'addEmail' ? 'Add your email' : step === 'addPhone' ? 'Add your mobile number' : 'Log in';

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="space-y-4 p-4">
        {step === 'start' && (
          <form onSubmit={e => { e.preventDefault(); send(payload()); }} className="space-y-4">
            <p className="text-sm text-muted">{reason || 'Your orders and rewards stay with you, at every venue, on every visit.'}</p>
            {mode === 'phone' ? phoneInput : emailInput}
            {errorBox}
            <Btn tone="brand" size="lg" className="w-full" loading={busy} disabled={mode === 'phone' ? phone.length !== 10 : !emailOk}>Continue</Btn>
            {switchLink}
          </form>
        )}

        {step === 'addEmail' && (
          <form onSubmit={e => { e.preventDefault(); send({ phone, email }); }} className="space-y-4">
            <p className="text-sm text-ink-2">Welcome! We&rsquo;ll send your login code to your email. You only do this once.</p>
            <p className="text-sm">+91 {phone} · <button type="button" className="font-semibold text-brand-text" onClick={() => restart()}>Change</button></p>
            {emailInput}
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Your name <span className="font-normal text-muted">(optional)</span></span>
              <input value={name} onChange={e => setName(e.target.value)} maxLength={40} autoComplete="given-name" className={inputCls} />
            </label>
            {errorBox}
            <Btn tone="brand" size="lg" className="w-full" loading={busy} disabled={!emailOk}>Send code to email</Btn>
          </form>
        )}

        {step === 'addPhone' && (
          <form onSubmit={e => { e.preventDefault(); send({ phone, email }); }} className="space-y-4">
            <p className="text-sm text-ink-2">New here? Add your mobile number so the venue can reach you about your order.</p>
            <p className="text-sm">{email} · <button type="button" className="font-semibold text-brand-text" onClick={() => restart()}>Change</button></p>
            {phoneInput}
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Your name <span className="font-normal text-muted">(optional)</span></span>
              <input value={name} onChange={e => setName(e.target.value)} maxLength={40} autoComplete="given-name" className={inputCls} />
            </label>
            {errorBox}
            <Btn tone="brand" size="lg" className="w-full" loading={busy} disabled={phone.length !== 10}>Send code to email</Btn>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={e => { e.preventDefault(); verify(); }} className="space-y-4">
            <p className="text-sm">We sent a 6-digit code to <b>{sent.to}</b> · <button type="button" className="font-semibold text-brand-text" onClick={() => restart()}>Change</button></p>
            {sent.devOtp
              ? <div className="rounded-xl bg-soft px-3.5 py-2.5 text-sm text-ink-2">Testing mode: your code is <b className="tabular tracking-[0.25em] text-ink">{sent.devOtp}</b>. Once email is switched on, it arrives in the inbox instead.</div>
              : <p className="rounded-xl bg-soft px-3.5 py-2.5 text-[13px] text-ink-2">Can&rsquo;t see it? Check your <b>Spam</b> or <b>Promotions</b> folder. It can take up to a minute.</p>}
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">6-digit code</span>
              <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                className={`${inputCls} tabular text-center text-xl tracking-[0.45em]`} />
            </label>
            {errorBox}
            <Btn tone="brand" size="lg" className="w-full" loading={busy} disabled={otp.length !== 6}>Verify and continue</Btn>
            <p className="text-center text-[13px] text-muted">
              {wait > 0 ? <>Resend code in <span className="tabular">{wait}s</span></>
                : <button type="button" className="font-semibold text-brand-text" onClick={() => send(phone ? { phone, ...(email ? { email } : {}) } : { email })}>Resend code</button>}
            </p>
          </form>
        )}
      </div>
    </Sheet>
  );
}

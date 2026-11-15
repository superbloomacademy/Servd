'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';
import { Btn, inputCls } from '@/components/ui/kit';

export default function StaffLogin() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await api<{ role: string }>('/api/staff/login', { body: { phone, pin } }); router.replace(r.role === 'super_admin' ? '/admin' : '/staff'); }
    catch (e2) { setErr((e2 as Error).message); setBusy(false); }
  };
  return (
    <main className="grid min-h-dvh place-items-center bg-soft px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm">
        <div className="text-2xl font-extrabold" style={{ fontFamily: 'var(--font-display)' }}>servd<span className="text-[#E23744]">.</span></div>
        <h1 className="mt-4 text-xl font-extrabold">Staff login</h1>
        <p className="mt-1 text-sm text-muted">Owners, managers, counters, kitchens and runners.</p>
        <label className="mt-5 block"><span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Mobile number</span>
          <input autoFocus inputMode="numeric" autoComplete="username" maxLength={10} value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} className={inputCls} /></label>
        <label className="mt-3 block"><span className="mb-1.5 block text-[13px] font-semibold text-ink-2">PIN</span>
          <input type="password" inputMode="numeric" autoComplete="current-password" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} className={`${inputCls} tracking-[0.4em]`} /></label>
        {err && <p className="mt-3 text-sm text-bad">{err}</p>}
        <Btn tone="dark" size="lg" className="mt-5 w-full" loading={busy} disabled={phone.length !== 10 || pin.length < 4}>Log in</Btn>
        <p className="mt-4 text-center text-xs text-muted">Forgot your PIN? Ask your owner to reset it.</p>
      </form>
    </main>
  );
}

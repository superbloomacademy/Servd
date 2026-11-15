'use client';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

// ---------------------------------------------------------------- toasts
type Toast = { id: number; text: string; tone: 'ok' | 'bad' };
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'bad') => void>(() => {});
export const useToast = () => useContext(ToastCtx);

// ---------------------------------------------------------------- confirmation popups
// Every important action asks first, and says exactly what will happen.
export type ConfirmOpts = {
  title: string; body?: React.ReactNode; confirm: string; cancel?: string; tone?: 'danger' | 'primary';
  input?: { label: string; placeholder?: string; required?: boolean };
};
type ConfirmState = ConfirmOpts & { resolve: (v: false | { value: string }) => void };
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<false | { value: string }>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export function Providers({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [value, setValue] = useState('');
  const n = useRef(0);

  const toast = useCallback((text: string, tone: 'ok' | 'bad' = 'ok') => {
    const id = ++n.current;
    setToasts(t => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), tone === 'bad' ? 4500 : 2800);
  }, []);

  const ask = useCallback((o: ConfirmOpts) => new Promise<false | { value: string }>(resolve => { setValue(''); setConfirm({ ...o, resolve }); }), []);
  const close = (v: false | { value: string }) => { confirm?.resolve(v); setConfirm(null); };
  const needsInput = !!confirm?.input?.required && !value.trim();

  return (
    <ToastCtx.Provider value={toast}>
      <ConfirmCtx.Provider value={ask}>
        {children}
        <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4">
          {toasts.map(t => (
            <div key={t.id} role="status" className={`anim-pop pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${t.tone === 'bad' ? 'bg-bad text-white' : 'bg-ink text-white'}`}>
              {t.tone === 'bad' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}<span>{t.text}</span>
            </div>
          ))}
        </div>
        {confirm && (
          <div className="anim-fade fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" onClick={e => e.target === e.currentTarget && close(false)}>
            <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="anim-sheet w-full max-w-md rounded-t-2xl bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] sm:rounded-2xl sm:pb-5">
              <div className="flex items-start justify-between gap-4">
                <h2 id="confirm-title" className="text-lg font-bold text-ink">{confirm.title}</h2>
                <button className="-m-1 rounded-full p-1 text-muted hover:bg-soft" onClick={() => close(false)} aria-label="Close"><X size={20} /></button>
              </div>
              {confirm.body && <div className="mt-2 text-[15px] leading-relaxed text-ink-2">{confirm.body}</div>}
              {confirm.input && (
                <label className="mt-4 block">
                  <span className="mb-1.5 block text-sm font-medium text-ink-2">{confirm.input.label}</span>
                  <input autoFocus value={value} onChange={e => setValue(e.target.value)} placeholder={confirm.input.placeholder}
                    className="w-full rounded-xl border border-line px-3.5 py-2.5 outline-none focus:border-ink" />
                </label>
              )}
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button className="rounded-xl border border-line py-3 font-semibold text-ink-2 hover:bg-soft" onClick={() => close(false)}>{confirm.cancel || 'Cancel'}</button>
                <button disabled={needsInput} onClick={() => close({ value })}
                  className={`rounded-xl py-3 font-semibold text-white disabled:opacity-40 ${confirm.tone === 'danger' ? 'bg-bad' : 'bg-ink'}`}>{confirm.confirm}</button>
              </div>
            </div>
          </div>
        )}
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  );
}

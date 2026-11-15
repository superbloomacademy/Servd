'use client';
import { X, Loader2 } from 'lucide-react';
import { useEffect } from 'react';

export function VegMark({ veg, size = 14 }: { veg: boolean; size?: number }) {
  return (
    <span title={veg ? 'Veg' : 'Non-veg'} aria-label={veg ? 'Veg' : 'Non-veg'}
      className={`inline-grid shrink-0 place-items-center rounded-[3px] border-[1.5px] ${veg ? 'border-veg' : 'border-nonveg'}`} style={{ width: size, height: size }}>
      {veg
        ? <span className="rounded-full bg-veg" style={{ width: size * 0.45, height: size * 0.45 }} />
        : <span className="border-x-transparent border-b-nonveg" style={{ width: 0, height: 0, borderLeftWidth: size * 0.28, borderRightWidth: size * 0.28, borderBottomWidth: size * 0.45, borderStyle: 'solid' }} />}
    </span>
  );
}

export function Spinner({ size = 18, className = '' }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} aria-label="Loading" />;
}

// Bottom sheet on phones, centered panel on larger screens.
export function Sheet({ open, onClose, title, children, footer, full = false, wide = false }: {
  open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; full?: boolean; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true"
        className={`anim-sheet flex w-full flex-col bg-white ${full ? 'h-[100dvh] sm:h-[90vh]' : 'max-h-[92dvh]'} ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} rounded-t-2xl sm:rounded-2xl`}>
        {title !== undefined && (
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
            <div className="min-w-0 text-[17px] font-bold">{title}</div>
            <button onClick={onClose} className="-mr-1 rounded-full p-1.5 text-muted hover:bg-soft" aria-label="Close"><X size={20} /></button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-line p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-good' : 'bg-[#CFD0D4]'}`}>
      <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
export const inputCls = 'w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[15px] outline-none transition focus:border-ink disabled:bg-soft';

export function Pill({ children, tone = 'neutral', className = '' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'brand' | 'info'; className?: string }) {
  const t = {
    neutral: 'bg-soft text-ink-2', good: 'bg-[#E7F6EF] text-[#11734E]', warn: 'bg-[#FFF3E0] text-[#9A5500]',
    bad: 'bg-[#FDECEE] text-[#B42334]', brand: 'bg-brand-soft text-brand-text', info: 'bg-[#E8F0FE] text-[#1F56C2]',
  }[tone];
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${t} ${className}`}>{children}</span>;
}

export function Empty({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-soft text-muted">{icon}</div>}
      <p className="font-semibold text-ink">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Btn({ children, tone = 'dark', size = 'md', className = '', loading, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'dark' | 'brand' | 'ghost' | 'danger' | 'good' | 'outline'; size?: 'sm' | 'md' | 'lg'; loading?: boolean;
}) {
  const t = {
    dark: 'bg-ink text-white hover:bg-black', brand: 'bg-brand text-brand-ink hover:brightness-95', ghost: 'text-ink-2 hover:bg-soft',
    danger: 'bg-white text-bad border border-line hover:bg-[#FDECEE]', good: 'bg-good text-white hover:brightness-95', outline: 'border border-line bg-white text-ink hover:bg-soft',
  }[tone];
  const s = { sm: 'px-3 py-1.5 text-[13px] rounded-lg', md: 'px-4 py-2.5 text-sm rounded-xl', lg: 'px-5 py-3.5 text-[15px] rounded-xl' }[size];
  return (
    <button {...p} disabled={p.disabled || loading} className={`inline-flex items-center justify-center gap-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${t} ${s} ${className}`}>
      {loading && <Spinner size={16} />}{children}
    </button>
  );
}

'use client';
import { useEffect } from 'react';

export function PrintBar({ label, auto }: { label: string; auto?: boolean }) {
  useEffect(() => { if (auto) setTimeout(() => window.print(), 400); }, [auto]);
  return (
    <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 bg-ink px-4 py-3 text-sm text-white">
      <span>{label}</span>
      <div className="flex gap-2"><button onClick={() => window.print()} className="rounded-lg bg-white px-4 py-1.5 font-bold text-ink">Print</button><button onClick={() => window.close()} className="rounded-lg px-3 py-1.5 font-semibold">Close</button></div>
    </div>
  );
}

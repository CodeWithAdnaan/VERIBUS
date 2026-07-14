'use client';
import { Printer } from 'lucide-react';

// Reusable print trigger (client). Server components can't take onClick.
export function PrintButton({ label = 'Print', className = '' }: { label?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={`no-print inline-flex items-center gap-1.5 rounded-ops border border-ink-600 px-3 py-1.5 text-13 text-ink-200 hover:bg-ink-800 ${className}`}
    >
      <Printer size={16} strokeWidth={1.5} /> {label}
    </button>
  );
}

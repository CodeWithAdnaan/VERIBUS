'use client';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { shortHash } from '@/lib/format';

// Hashes render as a1b2c3…f9e8d7 in mono, tinted, with a copy button (§16).
export function Hash({ value, className = '' }: { value?: string | null; className?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="tnum text-ink-500">—</span>;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <code className="tnum text-12 text-ink-400" title={value}>
        {shortHash(value)}
      </code>
      <button
        type="button"
        aria-label="Copy hash"
        className="text-ink-500 transition-colors hover:text-sig-info"
        onClick={() => {
          navigator.clipboard?.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </span>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { CountUp } from '@/components/motion/CountUp';

// Circular score gauge. A champagne→emerald arc sweeps to the value once the
// gauge scrolls into view; the centre value counts up in step. The numeral is
// coloured by threshold (emerald good · gold watch · red poor) so the meaning
// survives even though the arc itself is always the premium foil sweep.
// Reduced motion: the transition duration is zeroed by the global killswitch,
// so the arc lands on its final frame immediately.
export function RadialGauge({
  value,
  max = 100,
  size = 132,
  stroke = 11,
  label,
  sublabel,
  className = '',
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, value / max));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setDrawn(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setDrawn(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const offset = drawn ? circ * (1 - pct) : circ;
  const numColor =
    pct >= 0.85 ? 'text-emerald-bright' : pct >= 0.65 ? 'text-gold' : 'text-sig-alert';
  const gid = `gauge-foil-${Math.round(size)}-${Math.round(value)}`;

  return (
    <div ref={wrapRef} className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--viz-1)" />
            <stop offset="35%" stopColor="var(--viz-2)" />
            <stop offset="70%" stopColor="var(--viz-3)" />
            <stop offset="100%" stopColor="var(--viz-4)" />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--ink-800)"
          strokeWidth={stroke}
        />
        {/* Value arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 1100ms cubic-bezier(0.2,0,0,1)',
            filter: 'drop-shadow(0 0 6px color-mix(in srgb, var(--viz-2) 70%, transparent))',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <CountUp end={Math.round(value)} className={`text-34 font-semibold leading-none ${numColor}`} />
        {label && (
          <span className="mt-1 text-11 font-medium uppercase tracking-[0.1em] text-ink-400">
            {label}
          </span>
        )}
        {sublabel && <span className="mt-0.5 text-11 text-ink-500">{sublabel}</span>}
      </div>
    </div>
  );
}

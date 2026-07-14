'use client';

import { useEffect, useRef, useState } from 'react';

export interface Bar {
  label: string;
  value: number;
  /** Optional per-bar colour override (CSS colour). Defaults to the viz palette. */
  color?: string;
}

// Vibrant, varied palette — each bar gets a different colour + matching glow.
const VIZ = [
  'var(--viz-1)',
  'var(--viz-2)',
  'var(--viz-3)',
  'var(--viz-4)',
  'var(--viz-5)',
  'var(--viz-6)',
];

// Compact animated bar chart. Bars grow from the baseline (staggered) once the
// chart scrolls into view, each in its own vivid colour with a soft glow and a
// hover sheen. Reduced motion zeroes the transition (global killswitch), so bars
// appear at full height instantly.
export function Bars({
  data,
  height = 120,
  className = '',
}: {
  data: Bar[];
  height?: number;
  className?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const ref = useRef<HTMLDivElement | null>(null);
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setGrown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setGrown(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      <div className="flex items-end gap-2.5" style={{ height }}>
        {data.map((d, i) => {
          const pct = d.value / max;
          const color = d.color ?? VIZ[i % VIZ.length];
          return (
            <div key={i} className="flex h-full flex-1 flex-col justify-end">
              <span className="tnum mb-1 text-center text-12 font-semibold" style={{ color }}>
                {d.value}
              </span>
              <div
                className="sheen w-full rounded-t-[4px] transition-[height] duration-700 ease-instrument"
                style={{
                  height: grown ? `${Math.max(3, pct * 100)}%` : '0%',
                  transitionDelay: `${i * 80}ms`,
                  background: `linear-gradient(180deg, ${color}, color-mix(in srgb, ${color} 55%, #000))`,
                  boxShadow: `0 0 20px -4px ${color}, inset 0 1px 0 color-mix(in srgb, ${color} 60%, #fff)`,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2.5">
        {data.map((d, i) => (
          <span
            key={i}
            className="flex-1 truncate text-center text-11 text-ink-400"
            title={d.label}
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';

// Scroll-triggered number counter. Fires once when 15% visible, then unobserves.
// Respects prefers-reduced-motion by rendering the final value immediately.
// Uses requestAnimationFrame for smooth 60fps counting.
export function CountUp({
  end,
  prefix = '',
  suffix = '',
  duration = 1200,
  className = '',
}: {
  end: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [value, setValue] = useState(0);
  const [fired, setFired] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || fired) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(end);
      setFired(true);
      return;
    }
    if (typeof IntersectionObserver === 'undefined') {
      setValue(end);
      setFired(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setFired(true);
          io.disconnect();
          const start = performance.now();
          const tick = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(1, elapsed / duration);
            // ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setValue(Math.round(eased * end));
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [end, duration, fired]);

  return (
    <span ref={ref} className={`tnum ${className}`}>
      {prefix}{value}{suffix}
    </span>
  );
}

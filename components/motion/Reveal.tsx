'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

// Fire-once scroll reveal for public surfaces. Progressive: server markup and
// no-JS render fully visible; the effect hides an element only when motion is
// allowed, IntersectionObserver exists, and the element starts below ~90% of
// the viewport. Content can never be trapped invisible. Reveals once, then
// unobserves — never re-triggers.
const EASE = 'cubic-bezier(0.2, 0, 0, 1)'; // = tailwind ease-instrument

export function Reveal({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof IntersectionObserver === 'undefined') return;
    if (el.getBoundingClientRect().top <= window.innerHeight * 0.9) return;
    setHidden(true);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setHidden(false);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={
        hidden
          ? { opacity: 0, transform: 'translateY(10px)' }
          : {
              opacity: 1,
              transform: 'none',
              transition: `opacity 500ms ${EASE}, transform 500ms ${EASE}`,
            }
      }
    >
      {children}
    </div>
  );
}

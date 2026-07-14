'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

// Animated scroll hint at the bottom of the hero viewport. Disappears on first
// scroll (> 50px). Pure CSS pulse animation.
export function ScrollHint({ className = '' }: { className?: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(false);
      return;
    }
    const onScroll = () => {
      if (window.scrollY > 50) {
        setVisible(false);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`flex flex-col items-center gap-1 text-ink-500 ${className}`}
      style={{ animation: 'scroll-hint 2s ease-in-out infinite' }}
      aria-hidden
    >
      <span className="text-11 uppercase tracking-[0.1em]">Scroll</span>
      <ChevronDown size={16} strokeWidth={1.5} />
    </div>
  );
}

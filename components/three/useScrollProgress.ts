'use client';

import { useEffect, useMemo, type RefObject } from 'react';

// Scroll progress (0..1) through a runway section, written to a plain external
// store so the R3F tree can read it per-frame without a React re-render per
// scroll tick.
export interface ProgressStore {
  get: () => number;
}

interface MutableProgressStore extends ProgressStore {
  set: (next: number) => void;
}

export function useScrollProgress(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
): ProgressStore {
  const store = useMemo<MutableProgressStore>(() => {
    let p = 0;
    return {
      get: () => p,
      set: (next) => {
        if (Math.abs(next - p) > 0.001 || next === 0 || next === 1) p = next;
      },
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      store.set(total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 1);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [enabled, ref, store]);

  return store;
}

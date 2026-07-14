'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { ChainFallback } from './ChainFallback';
import { CHAIN_STORY } from './chainData';
import { useScrollProgress } from './useScrollProgress';

// The single client boundary the landing page imports. Its server-rendered
// output is the static fallback; three.js lives exclusively in the ssr:false
// chunk below and is fetched only after hydration + WebGL probe + the runway
// approaching the viewport (400px). The hero text above never waits for any
// of this.
const HashChainScene = dynamic(() => import('./HashChainScene'), {
  ssr: false,
  loading: () => null,
});

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function ChainCanvas() {
  const sectionRef = useRef<HTMLElement | null>(null);
  // SSR and every non-3D path render the same static payoff frame.
  const [mode, setMode] = useState<'static' | '3d'>('static');
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const is3d = mode === '3d';
  const progress = useScrollProgress(sectionRef, is3d && visible);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof IntersectionObserver === 'undefined') return;
    if (!webglAvailable()) return;
    const el = sectionRef.current;
    if (!el) return;
    let activated = false;
    const io = new IntersectionObserver(
      (entries) => {
        const isIn = entries.some((e) => e.isIntersecting);
        if (isIn && !activated) {
          activated = true;
          setMode('3d');
        }
        setVisible(isIn);
      },
      { rootMargin: '400px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className={is3d ? 'relative h-[180vh] md:h-[200vh]' : 'relative'}
    >
      <p className="sr-only">{CHAIN_STORY}</p>
      <div className={is3d ? 'sticky top-0 flex h-screen items-center' : ''}>
        <div
          className={
            is3d
              ? 'relative h-[52vh] max-h-[520px] w-full'
              : 'relative mx-auto w-full max-w-5xl px-5 py-8'
          }
        >
          {is3d && (
            <HashChainScene
              progress={progress}
              visible={visible}
              onReady={() => setReady(true)}
            />
          )}
          {!ready && (
            <ChainFallback
              className={is3d ? 'absolute inset-0 h-full w-full' : 'h-auto w-full'}
            />
          )}
        </div>
      </div>
    </section>
  );
}

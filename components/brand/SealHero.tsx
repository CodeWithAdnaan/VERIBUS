'use client';

import { Seal, type SealState } from './Seal';

// Large hero seal with optional slow rotation animation. The rotation is purely
// CSS, respects prefers-reduced-motion via the killswitch in tokens.css, and adds
// a subtle "living document" feel to the government stamp metaphor.
export function SealHero({
  state = 'intact',
  size = 120,
  animate = true,
  className = '',
}: {
  state?: SealState;
  size?: number;
  animate?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      {/* Colourful glow halo — pulses gently behind the stamp. Decorative but
          symmetric, so it reads as light, not a second mark. */}
      <span
        className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-viz-2/30 blur-2xl animate-glow-pulse"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute inset-0 -z-10 scale-110 rounded-full bg-viz-1/20 blur-3xl animate-glow-pulse"
        style={{ animationDelay: '1.5s' }}
        aria-hidden
      />
      <div
        className="inline-flex items-center justify-center text-sig-info"
        style={animate ? { animation: 'seal-rotate 90s linear infinite' } : undefined}
      >
        <Seal state={state} size={size} title="VERIBUS — Verified" idSuffix="-hero" />
      </div>
    </div>
  );
}

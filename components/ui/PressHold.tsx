'use client';
import { useRef, useState } from 'react';

// Press-and-hold control (BUILD SPEC §9). No accidental taps — the action only
// fires after the finger is held for holdMs. Used for SOS (2s) and END TRIP.
export function PressHold({
  label,
  holdingLabel,
  holdMs = 2000,
  onComplete,
  tone = 'danger',
  className = '',
}: {
  label: string;
  holdingLabel?: string;
  holdMs?: number;
  onComplete: () => void;
  tone?: 'danger' | 'primary';
  className?: string;
}) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const raf = useRef<number | null>(null);
  const startedAt = useRef<number | null>(null);

  const bg = tone === 'danger' ? 'bg-sig-critical' : 'bg-sig-info';
  const fg = 'text-white';
  const fill = 'bg-white/25';

  function tick() {
    const elapsed = performance.now() - (startedAt.current ?? 0);
    const p = Math.min(1, elapsed / holdMs);
    setProgress(p);
    if (p >= 1) {
      cancel();
      onComplete();
      return;
    }
    raf.current = requestAnimationFrame(tick);
  }
  function begin() {
    setHolding(true);
    startedAt.current = performance.now();
    raf.current = requestAnimationFrame(tick);
  }
  function cancel() {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    startedAt.current = null;
    setHolding(false);
    setProgress(0);
  }

  return (
    <button
      type="button"
      onPointerDown={begin}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      className={`relative min-h-[56px] w-full select-none overflow-hidden rounded-counter border border-transparent text-16 font-semibold ${fg} ${bg} ${className}`}
    >
      <span
        className={`absolute inset-y-0 left-0 transition-[width] duration-75 ${fill}`}
        style={{ width: `${progress * 100}%` }}
        aria-hidden
      />
      <span className="relative z-10">{holding ? (holdingLabel ?? 'Keep holding…') : label}</span>
    </button>
  );
}

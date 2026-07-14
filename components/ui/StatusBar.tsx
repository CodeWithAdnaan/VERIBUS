import type { ReactNode } from 'react';

// Persistent ops top bar: ● 4 trips active · 2 open criticals · chain: VALID (§16).
// Live dots pulse via the .dot-live class (globals.css dot-pulse keyframe).
export interface StatusSegment {
  dot?: 'ok' | 'watch' | 'alert' | 'critical' | 'info' | 'unmonitored';
  label: ReactNode;
  live?: boolean;
}

const DOT: Record<NonNullable<StatusSegment['dot']>, string> = {
  ok: 'bg-sig-ok',
  watch: 'bg-sig-watch',
  alert: 'bg-sig-alert',
  critical: 'bg-sig-critical',
  info: 'bg-sig-info',
  unmonitored: 'bg-sig-unmonitored',
};

export function StatusBar({ segments }: { segments: StatusSegment[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-gold/12 bg-ink-900/60 px-4 py-2 text-12 text-ink-200 backdrop-blur">
      {segments.map((s, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {s.dot && (
            <span
              className={`h-2 w-2 rounded-full transition-colors duration-120 ease-instrument ${DOT[s.dot]} ${s.live ? 'dot-live' : ''}`}
              aria-hidden
            />
          )}
          <span className="tnum transition-colors duration-120 ease-instrument">{s.label}</span>
          {i < segments.length - 1 && <span className="ml-1.5 text-ink-600" aria-hidden>·</span>}
        </span>
      ))}
    </div>
  );
}

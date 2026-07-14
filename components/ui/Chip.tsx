import type { ReactNode } from 'react';
import {
  CheckCircle2, AlertTriangle, AlertOctagon, Info, Circle, WifiOff, PlayCircle, PenLine,
} from 'lucide-react';

// Semantic chips. Colour NEVER carries meaning alone — every chip has an icon + text.
export type ChipVariant =
  | 'ok' | 'watch' | 'alert' | 'critical' | 'info' | 'neutral'
  | 'unmonitored' | 'replay' | 'manual';

const MAP: Record<ChipVariant, { fg: string; bd: string; Icon: typeof Info }> = {
  ok: { fg: 'text-sig-ok', bd: 'border-sig-ok/40', Icon: CheckCircle2 },
  watch: { fg: 'text-sig-watch', bd: 'border-sig-watch/40', Icon: AlertTriangle },
  alert: { fg: 'text-sig-alert', bd: 'border-sig-alert/50', Icon: AlertTriangle },
  critical: { fg: 'text-sig-critical', bd: 'border-sig-critical/60', Icon: AlertOctagon },
  info: { fg: 'text-sig-info', bd: 'border-sig-info/40', Icon: Info },
  neutral: { fg: 'text-ink-300', bd: 'border-ink-600', Icon: Circle },
  unmonitored: { fg: 'text-sig-unmonitored', bd: 'border-ink-600', Icon: WifiOff },
  replay: { fg: 'text-sig-info', bd: 'border-sig-info/50', Icon: PlayCircle },
  manual: { fg: 'text-ink-400', bd: 'border-ink-600', Icon: PenLine },
};

export function Chip({
  variant = 'neutral',
  children,
  title,
  className = '',
}: {
  variant?: ChipVariant;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  const { fg, bd, Icon } = MAP[variant];
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-ops border transition-colors duration-120 ease-instrument ${bd} bg-ink-950/40 px-1.5 py-0.5 text-11 font-medium ${fg} ${className}`}
    >
      <Icon size={13} strokeWidth={1.75} aria-hidden />
      {children}
    </span>
  );
}

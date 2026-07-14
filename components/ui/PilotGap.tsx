import type { ReactNode } from 'react';
import { Construction } from 'lucide-react';
import { pilotGap } from '@/lib/pilotGaps';

// A deliberately-styled note stating a real pilot gap out loud (§2). Either pass an
// id from the PILOT_GAPS registry, or a title + children for an inline note.
export function PilotGap({
  id,
  title,
  children,
  className = '',
}: {
  id?: string;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const reg = id ? pilotGap(id) : undefined;
  const heading = title ?? reg?.title ?? 'Pilot gap';
  const body = children ?? reg?.body;
  return (
    <div
      className={`rounded-ops border border-dashed border-sig-watch/50 bg-sig-watch/[0.06] px-3 py-2 ${className}`}
    >
      <div className="flex items-center gap-1.5 text-11 font-semibold uppercase tracking-[0.08em] text-sig-watch">
        <Construction size={14} strokeWidth={1.75} aria-hidden />
        Pilot gap — {heading}
      </div>
      {body && <p className="mt-1 text-12 leading-relaxed text-ink-300">{body}</p>}
    </div>
  );
}

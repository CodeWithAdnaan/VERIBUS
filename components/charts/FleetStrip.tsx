import Link from 'next/link';
import { CountUp } from '@/components/motion/CountUp';

// Fleet compliance strip — horizontal bars, SORTED WORST-FIRST (that is what an
// officer needs). Each bar is a vivid gradient in its semantic band (green→teal
// good · amber→orange watch · red→pink poor) with a colour-matched glow and a
// hover sheen — loud, but the at-a-glance signal survives.
export interface FleetRow {
  id: string;
  label: string;
  sublabel?: string;
  score: number;
  href?: string;
}

// [base, bright] gradient stops per band.
function scoreStops(score: number): [string, string] {
  if (score >= 85) return ['var(--sig-ok)', 'var(--viz-4)']; // green → teal
  if (score >= 65) return ['var(--sig-watch)', 'var(--viz-6)']; // amber → orange
  return ['var(--sig-alert)', 'var(--viz-3)']; // red → pink
}

function scoreText(score: number): string {
  if (score >= 85) return 'text-sig-ok';
  if (score >= 65) return 'text-sig-watch';
  return 'text-sig-alert';
}

export function FleetStrip({ rows }: { rows: FleetRow[] }) {
  const sorted = [...rows].sort((a, b) => a.score - b.score); // worst first
  return (
    <ul className="space-y-1.5">
      {sorted.map((r) => {
        const [base, bright] = scoreStops(r.score);
        const inner = (
          <div className="flex items-center gap-3">
            <div className="w-28 shrink-0">
              <div className="truncate text-13 text-ink-100">{r.label}</div>
              {r.sublabel && <div className="truncate text-11 text-ink-500">{r.sublabel}</div>}
            </div>
            <div className="relative h-5 flex-1 overflow-hidden rounded-ops border border-ink-700/60 bg-ink-800">
              <div
                className="sheen h-full rounded-ops"
                style={{
                  width: `${Math.max(2, r.score)}%`,
                  backgroundImage: `linear-gradient(90deg, ${base}, ${bright})`,
                  boxShadow: `0 0 16px -4px ${bright}`,
                }}
              />
            </div>
            <CountUp
              end={Math.round(r.score)}
              className={`w-8 text-right text-14 font-semibold ${scoreText(r.score)}`}
            />
          </div>
        );
        return (
          <li key={r.id}>
            {r.href ? (
              <Link href={r.href} className="block rounded-ops px-1 py-0.5 hover:bg-ink-800/60">
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ============================================================================
// ★ SPEED-TIME STRIP — the hero graphic of the whole project (BUILD SPEC §16).
// Hand-built SVG. x = time, y = speed. A horizontal limit band. Violation windows
// shaded alert with the peak called out. Directly beneath: a 6px SIGNAL QUALITY
// LANE (one tick per fix, GOOD / DEGRADED / GAP). One glance tells the whole
// honesty story: here is the violation, and here is exactly how well we could see.
// Pure render — no client JS.
// ============================================================================
export interface SpeedPoint {
  t: number; // epoch ms
  kmh: number | null;
  quality: 'GOOD' | 'DEGRADED' | 'REJECTED';
}
export interface ViolationWindow {
  start: number;
  end: number;
  peak?: number;
}
export interface UnmonitoredGap {
  start: number;
  end: number;
}

const W = 1000;
const PAD = { t: 16, r: 16, b: 16, l: 40 };

export function SpeedTimeStrip({
  points,
  limitKmh,
  toleranceKmh = 0,
  windows = [],
  gaps = [],
  height = 200,
  laneHeight = 14,
}: {
  points: SpeedPoint[];
  limitKmh: number | null;
  toleranceKmh?: number;
  windows?: ViolationWindow[];
  gaps?: UnmonitoredGap[];
  height?: number;
  laneHeight?: number;
}) {
  if (points.length === 0) {
    return (
      <div className="flex h-[120px] items-center justify-center rounded-ops border border-ink-700 text-12 text-ink-500">
        No GPS fixes yet for this trip.
      </div>
    );
  }
  const plotH = height - laneHeight - 8;
  const t0 = Math.min(...points.map((p) => p.t));
  const t1 = Math.max(...points.map((p) => p.t)) || t0 + 1;
  const span = t1 - t0 || 1;
  const speeds = points.map((p) => p.kmh ?? 0);
  const threshold = limitKmh != null ? limitKmh + toleranceKmh : null;
  const maxK = Math.max(60, ...(threshold ? [threshold + 15] : []), ...speeds) * 1.05;

  const x = (t: number) => PAD.l + ((t - t0) / span) * (W - PAD.l - PAD.r);
  const y = (k: number) => PAD.t + (1 - k / maxK) * (plotH - PAD.t - PAD.b);

  // Speed path, broken across null / large gaps.
  let d = '';
  let pen = false;
  for (const p of points) {
    if (p.kmh == null) { pen = false; continue; }
    const cmd = pen ? 'L' : 'M';
    d += `${cmd}${x(p.t).toFixed(1)},${y(p.kmh).toFixed(1)} `;
    pen = true;
  }

  const gridK = [0, Math.round(maxK / 2), Math.round(maxK)];

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label="Speed over time with signal quality">
      {/* y grid */}
      {gridK.map((k) => (
        <g key={k}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(k)} y2={y(k)} stroke="var(--ink-800)" strokeWidth={1} />
          <text x={PAD.l - 6} y={y(k) + 3} textAnchor="end" fontSize="10" fill="var(--ink-500)" className="tnum">{k}</text>
        </g>
      ))}

      {/* limit band (limit … limit+tolerance) + threshold rule — draws in on
          mount (300ms fade to its own final opacity) */}
      {limitKmh != null && threshold != null && (
        <>
          <rect x={PAD.l} y={y(threshold)} width={W - PAD.l - PAD.r} height={Math.max(0, y(limitKmh) - y(threshold))} fill="var(--sig-watch)" opacity={0.1} className="sts-fade" style={{ animationDelay: '200ms' }} />
          <line x1={PAD.l} x2={W - PAD.r} y1={y(threshold)} y2={y(threshold)} stroke="var(--sig-watch)" strokeWidth={1} strokeDasharray="4 3" className="sts-fade" style={{ animationDelay: '200ms' }} />
          <text x={W - PAD.r} y={y(threshold) - 3} textAnchor="end" fontSize="10" fill="var(--sig-watch)" className="tnum">
            limit {limitKmh}+{toleranceKmh}
          </text>
        </>
      )}

      {/* unmonitored gaps (dashed grey band) */}
      {gaps.map((g, i) => (
        <rect key={`g${i}`} x={x(g.start)} y={PAD.t} width={Math.max(1, x(g.end) - x(g.start))} height={plotH - PAD.t - PAD.b}
          fill="var(--sig-unmonitored)" opacity={0.12} />
      ))}

      {/* violation windows shaded alert + peak callout */}
      {windows.map((w, i) => (
        <g key={`w${i}`}>
          <rect x={x(w.start)} y={PAD.t} width={Math.max(1, x(w.end) - x(w.start))} height={plotH - PAD.t - PAD.b} fill="var(--sig-alert)" opacity={0.12} className="sts-fade" style={{ animationDelay: '400ms' }} />
          <line x1={x(w.start)} x2={x(w.end)} y1={PAD.t} y2={PAD.t} stroke="var(--sig-alert)" strokeWidth={2} className="sts-fade" style={{ animationDelay: '400ms' }} />
          {w.peak != null && (
            <text x={(x(w.start) + x(w.end)) / 2} y={PAD.t + 12} textAnchor="middle" fontSize="11" fontWeight={600} fill="var(--sig-alert)" className="tnum">
              {Math.round(w.peak)} km/h
            </text>
          )}
        </g>
      ))}

      {/* speed line — draws once on mount (pathLength normalizes dash math) */}
      <path d={d} fill="none" stroke="var(--sig-info)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="sts-draw" />

      {/* ── SIGNAL QUALITY LANE ── */}
      <g transform={`translate(0, ${plotH + 6})`}>
        <rect x={PAD.l} y={0} width={W - PAD.l - PAD.r} height={laneHeight} fill="var(--ink-950)" stroke="var(--ink-800)" strokeWidth={1} />
        {points.map((p, i) => {
          const col =
            p.quality === 'GOOD' ? 'var(--sig-ok)' : p.quality === 'DEGRADED' ? 'var(--sig-watch)' : 'var(--sig-alert)';
          return <rect key={i} x={x(p.t)} y={1} width={2} height={laneHeight - 2} fill={col} />;
        })}
        {gaps.map((g, i) => (
          <rect key={`lg${i}`} x={x(g.start)} y={1} width={Math.max(2, x(g.end) - x(g.start))} height={laneHeight - 2}
            fill="var(--sig-unmonitored)" opacity={0.7} />
        ))}
      </g>
    </svg>
  );
}

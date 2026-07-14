import { BREAK_INDEX, CHAIN_BLOCKS, MISMATCH_HASH } from './chainData';

// The static payoff frame of the hero chain — served in the initial HTML and
// kept for prefers-reduced-motion, missing WebGL, no-JS, and the lazy-chunk
// loading window. It tells the whole story on its own: assembled chain, one
// tampered block, hazard fracture, downstream greyed to --sig-unmonitored.
// Inline SVG: CSS variables resolve; hex fallbacks mirror design/tokens.css.

const W = 110; // block width
const H = 64; // block height
const GAP = 24;
const X0 = 23;
const TOP = 88;
const MID = TOP + H / 2;

export function ChainFallback({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 960 240"
      preserveAspectRatio="xMidYMid meet"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <pattern
          id="vbf-hazard"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="3" height="6" style={{ fill: 'var(--sig-alert, #c22b1f)' }} />
          <rect x="3" width="3" height="6" style={{ fill: 'var(--ink-950, #0a0e12)' }} />
        </pattern>
      </defs>

      {/* connectors */}
      {CHAIN_BLOCKS.slice(0, -1).map((b, i) => {
        const x = X0 + i * (W + GAP) + W;
        const downstream = i >= BREAK_INDEX;
        return (
          <line
            key={`c${b.seq}`}
            x1={x}
            y1={MID}
            x2={x + GAP}
            y2={MID}
            strokeWidth="2"
            style={{
              stroke: downstream ? 'var(--sig-unmonitored, #6e8093)' : 'var(--ink-600, #2e3a46)',
            }}
            opacity={downstream ? 0.6 : 1}
          />
        );
      })}

      {/* blocks */}
      {CHAIN_BLOCKS.map((b, i) => {
        const x = X0 + i * (W + GAP);
        const downstream = i >= BREAK_INDEX;
        const tampered = i === BREAK_INDEX;
        const stroke = downstream ? 'var(--sig-unmonitored, #6e8093)' : 'var(--ink-500, #48586a)';
        const hashFill = tampered
          ? 'var(--sig-alert, #c22b1f)'
          : downstream
            ? 'var(--sig-unmonitored, #6e8093)'
            : 'var(--ink-200, #c7d1da)';
        return (
          <g key={b.seq} opacity={downstream && !tampered ? 0.7 : 1}>
            <rect
              x={x}
              y={TOP}
              width={W}
              height={H}
              rx="3"
              strokeWidth="1.5"
              style={{ fill: 'var(--ink-900, #10151b)', stroke }}
            />
            <text
              x={x + W / 2}
              y={TOP + 24}
              textAnchor="middle"
              fontSize="9"
              className="tnum"
              style={{ fill: 'var(--ink-500, #48586a)' }}
            >
              {b.kind}
            </text>
            <text
              x={x + W / 2}
              y={TOP + 46}
              textAnchor="middle"
              fontSize="12.5"
              className="tnum"
              style={{ fill: hashFill }}
            >
              {tampered ? MISMATCH_HASH : b.hash}
            </text>
          </g>
        );
      })}

      {/* the fracture: hazard tape across the broken link, over a dark seam */}
      {(() => {
        const mid = X0 + BREAK_INDEX * (W + GAP) - GAP / 2;
        return (
          <g transform={`rotate(-4 ${mid} ${MID})`}>
            <rect
              x={mid - 11}
              y={TOP - 14}
              width="22"
              height={H + 28}
              style={{ fill: 'var(--ink-950, #0a0e12)' }}
            />
            <rect x={mid - 7} y={TOP - 12} width="14" height={H + 24} fill="url(#vbf-hazard)" />
          </g>
        );
      })()}
    </svg>
  );
}

import type { SVGProps } from 'react';

// The VERIBUS mark — an official seal. A seal is either intact or broken, which
// is precisely what the product asserts about every trip. The broken state
// severs the stamp with the --hazard stripe pattern: tamper is a pattern, never
// a red glow (design/tokens.css). Single-colour via currentColor; legible from
// 16px (favicon) to 400px (hero). This 64-unit geometry is the master for
// public/icon.svg and design/og.html.
//
// The outer ring with notch teeth references official government stamps — a seal
// of authority, integrity, tamper-evidence. The V is the core mark (Verified).
export type SealState = 'intact' | 'broken';

export function Seal({
  state = 'intact',
  size = 20,
  title,
  idSuffix = '',
  ...rest
}: {
  state?: SealState;
  size?: number;
  title?: string;
  /** Disambiguates SVG pattern/clip ids when several broken Seals share a page. */
  idSuffix?: string;
} & Omit<SVGProps<SVGSVGElement>, 'width' | 'height'>) {
  const patternId = `vb-hazard${idSuffix}`;
  const clipId = `vb-seal-clip${idSuffix}`;
  const isSmall = size <= 24;

  // For very small sizes (favicon, nav), use the simplified geometry
  if (isSmall) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="square"
        strokeLinejoin="miter"
        role={title ? 'img' : undefined}
        aria-hidden={title ? undefined : true}
        {...rest}
      >
        {title ? <title>{title}</title> : null}
        {/* the stamp: rx 2/24 mirrors the 4px rounded-ops ratio */}
        <rect x="3" y="3" width="18" height="18" rx="2" />
        {/* the V: VERIBUS / verified */}
        <path d="M8 8 L12 16 L16 8" />
        {state === 'broken' && (
          <>
            <defs>
              <pattern
                id={patternId}
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="3" height="6" style={{ fill: 'var(--sig-alert, #c22b1f)' }} />
                <rect x="3" width="3" height="6" style={{ fill: 'var(--ink-950, #0a0e12)' }} />
              </pattern>
              <clipPath id={clipId}>
                <rect x="2" y="2" width="20" height="20" rx="2.5" />
              </clipPath>
            </defs>
            <g clipPath={`url(#${clipId})`} stroke="none">
              <rect
                x="-4"
                y="8.5"
                width="32"
                height="7"
                transform="rotate(-45 12 12)"
                style={{ fill: 'var(--ink-950, #0a0e12)' }}
              />
              <rect
                x="-4"
                y="9.5"
                width="32"
                height="5"
                transform="rotate(-45 12 12)"
                fill={`url(#${patternId})`}
              />
            </g>
          </>
        )}
      </svg>
    );
  }

  // Full seal: outer cog ring with teeth, inner circle, V glyph, VERIFIED arc
  const cx = 32;
  const cy = 32;
  const outerR = 29;
  const innerR = 23;
  const teethCount = 24;

  // Generate cog teeth as a path
  const toothDepth = 3.5;
  const toothWidth = 0.45; // fraction of tooth angular span
  let teethPath = '';
  for (let i = 0; i < teethCount; i++) {
    const angle = (i * 2 * Math.PI) / teethCount;
    const halfTooth = (Math.PI / teethCount) * toothWidth;

    const innerStart = {
      x: cx + outerR * Math.cos(angle - halfTooth),
      y: cy + outerR * Math.sin(angle - halfTooth),
    };
    const outerStart = {
      x: cx + (outerR + toothDepth) * Math.cos(angle - halfTooth * 0.6),
      y: cy + (outerR + toothDepth) * Math.sin(angle - halfTooth * 0.6),
    };
    const outerEnd = {
      x: cx + (outerR + toothDepth) * Math.cos(angle + halfTooth * 0.6),
      y: cy + (outerR + toothDepth) * Math.sin(angle + halfTooth * 0.6),
    };
    const innerEnd = {
      x: cx + outerR * Math.cos(angle + halfTooth),
      y: cy + outerR * Math.sin(angle + halfTooth),
    };

    if (i === 0) {
      teethPath += `M${innerStart.x.toFixed(2)},${innerStart.y.toFixed(2)} `;
    }
    teethPath += `L${outerStart.x.toFixed(2)},${outerStart.y.toFixed(2)} `;
    teethPath += `L${outerEnd.x.toFixed(2)},${outerEnd.y.toFixed(2)} `;
    teethPath += `L${innerEnd.x.toFixed(2)},${innerEnd.y.toFixed(2)} `;

    // Arc to next tooth's inner start
    const nextAngle = ((i + 1) * 2 * Math.PI) / teethCount;
    const nextHalfTooth = (Math.PI / teethCount) * toothWidth;
    const nextInnerStart = {
      x: cx + outerR * Math.cos(nextAngle - nextHalfTooth),
      y: cy + outerR * Math.sin(nextAngle - nextHalfTooth),
    };
    teethPath += `A${outerR},${outerR} 0 0,1 ${nextInnerStart.x.toFixed(2)},${nextInnerStart.y.toFixed(2)} `;
  }
  teethPath += 'Z';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeLinecap="square"
      strokeLinejoin="miter"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      {...rest}
    >
      {title ? <title>{title}</title> : null}

      {/* Outer cog ring */}
      <path
        d={teethPath}
        strokeWidth={1.5}
        fill="none"
      />

      {/* Inner circle */}
      <circle cx={cx} cy={cy} r={innerR} strokeWidth={1.5} fill="none" />

      {/* Inner ring detail */}
      <circle cx={cx} cy={cy} r={innerR - 3} strokeWidth={0.75} fill="none" opacity={0.4} />

      {/* The V glyph — larger, bolder */}
      <path
        d="M22 22 L32 42 L42 22"
        strokeWidth={2.5}
        fill="none"
      />

      {/* Small dots at the V terminals */}
      <circle cx={22} cy={22} r={1.5} fill="currentColor" stroke="none" />
      <circle cx={42} cy={22} r={1.5} fill="currentColor" stroke="none" />
      <circle cx={32} cy={42} r={1.5} fill="currentColor" stroke="none" />

      {/* VERIFIED arc text (bottom) */}
      <defs>
        <path
          id={`vb-arc${idSuffix}`}
          d={`M${cx - 17},${cy + 2} A17,17 0 0,1 ${cx + 17},${cy + 2}`}
        />
      </defs>
      <text
        fontSize="5.5"
        fill="currentColor"
        stroke="none"
        letterSpacing="0.18em"
        fontWeight={600}
      >
        <textPath
          href={`#vb-arc${idSuffix}`}
          startOffset="50%"
          textAnchor="middle"
        >
          VERIFIED
        </textPath>
      </text>

      {/* Top label: small dots as decorators */}
      <circle cx={cx} cy={cy - innerR + 6} r={1} fill="currentColor" stroke="none" opacity={0.5} />

      {state === 'broken' && (
        <>
          <defs>
            <pattern
              id={patternId}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="3" height="6" style={{ fill: 'var(--sig-alert, #c22b1f)' }} />
              <rect x="3" width="3" height="6" style={{ fill: 'var(--ink-950, #0a0e12)' }} />
            </pattern>
            <clipPath id={clipId}>
              <circle cx={cx} cy={cy} r={outerR + toothDepth} />
            </clipPath>
          </defs>
          {/* the fracture: hazard band cutting through the seal diagonally */}
          <g clipPath={`url(#${clipId})`} stroke="none">
            <rect
              x="-10"
              y="26"
              width="84"
              height="12"
              transform={`rotate(-45 ${cx} ${cy})`}
              style={{ fill: 'var(--ink-950, #0a0e12)' }}
            />
            <rect
              x="-10"
              y="28"
              width="84"
              height="8"
              transform={`rotate(-45 ${cx} ${cy})`}
              fill={`url(#${patternId})`}
            />
          </g>
        </>
      )}
    </svg>
  );
}

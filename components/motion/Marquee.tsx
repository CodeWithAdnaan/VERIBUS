import type { ReactNode } from 'react';

// Seamless right-to-left keyword marquee. Pure CSS (no JS): the track holds two
// identical copies of the content and animates translateX 0 → -50%, so the loop
// is perfectly seamless. Each item + separator cycles through the vibrant viz
// palette, so the band reads as "different colours". Honours reduced-motion via
// the global killswitch (the track simply stops on its first frame).
//
// direction 'rtl' (default) → content enters from the right, exits left.
const VIZ = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)', 'var(--viz-5)', 'var(--viz-6)'];

export function Marquee({
  items,
  speed = 34,
  direction = 'rtl',
  className = '',
  itemClassName = 'text-13 font-semibold uppercase tracking-[0.18em]',
  colorful = true,
}: {
  items: ReactNode[];
  speed?: number;
  direction?: 'rtl' | 'ltr';
  className?: string;
  itemClassName?: string;
  /** Colour each item from the viz palette (default). False = inherit ink colour. */
  colorful?: boolean;
}) {
  const renderGroup = (hidden: boolean) => (
    <div className="flex shrink-0 items-center" aria-hidden={hidden}>
      {items.map((it, i) => {
        const color = VIZ[i % VIZ.length];
        return (
          <span
            key={i}
            className={`inline-flex items-center whitespace-nowrap ${itemClassName} ${colorful ? '' : 'text-ink-300'}`}
            style={colorful ? { color } : undefined}
          >
            {it}
            <span
              className="mx-5 h-1.5 w-1.5 rotate-45 sm:mx-8"
              style={{ background: VIZ[(i + 1) % VIZ.length] }}
              aria-hidden
            />
          </span>
        );
      })}
    </div>
  );

  return (
    <div className={`marquee ${direction === 'ltr' ? 'marquee--reverse' : ''} ${className}`}>
      <div className="marquee__track" style={{ animationDuration: `${speed}s` }}>
        {renderGroup(false)}
        {renderGroup(true)}
      </div>
    </div>
  );
}

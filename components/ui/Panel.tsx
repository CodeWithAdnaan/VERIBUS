import type { ReactNode } from 'react';

// Hairline panel — an instrument, not a SaaS card. 1px hairline, radius ≤ 4px, no shadow.
// Optional left accent for semantic state (--sig-info for info, --sig-alert for alert, etc.)
export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = '',
  bodyClassName = 'p-3',
  accent,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Optional left border accent colour (Tailwind class, e.g. 'border-l-sig-info') */
  accent?: string;
}) {
  return (
    <section
      className={`relative overflow-hidden rounded-ops border border-ink-700 bg-ink-900 shadow-lux ${accent ? `border-l-2 ${accent}` : ''} ${className}`}
    >
      {/* Champagne top edge — a 1px foil rule reads as premium hardware, subtly. */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[image:var(--foil)] opacity-40"
        aria-hidden
      />
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-gold/15 px-3 py-2">
          <div>
            {title && (
              <h2 className="text-11 font-medium uppercase tracking-[0.1em] text-ink-200">{title}</h2>
            )}
            {subtitle && <p className="mt-0.5 text-11 text-ink-500">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

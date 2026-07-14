import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'gold' | 'ghost' | 'danger' | 'quiet';

// 'primary'/'gold' are the vibrant CTA — a blue→violet→magenta jewel gradient
// with white text, a colourful glow and a hover sheen sweep. 'danger' keeps red.
const CTA =
  'bg-[image:var(--cta)] bg-[length:180%_auto] text-white font-semibold border-transparent shadow-gold sheen hover:bg-[length:140%_auto]';

const VARIANTS: Record<Variant, string> = {
  primary: CTA,
  gold: CTA,
  danger: 'bg-sig-alert text-white hover:bg-sig-alert/90 border-transparent',
  ghost: 'bg-transparent text-ink-100 hover:bg-ink-800 border-ink-600 hover:border-viz-1/60',
  quiet: 'bg-ink-800 text-ink-200 hover:bg-ink-700 border-ink-700',
};

export function Button({
  variant = 'ghost',
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-ops border px-3 py-1.5 text-13 font-medium transition-all duration-120 ease-instrument disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

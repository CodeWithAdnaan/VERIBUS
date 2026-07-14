import { Seal } from './Seal';

// VERIBUS set in IBM Plex with the wide tracking the landing page established.
// Purely presentational — call sites decide colour (inherited) and wrap in
// <Link> where the lockup is a home link.
const TEXT: Record<'sm' | 'md' | 'lg' | 'hero', string> = {
  sm: 'text-12 tracking-[0.12em]',
  md: 'text-14 tracking-[0.12em]',
  lg: 'text-44 leading-none tracking-[0.06em]',
  hero: 'text-[56px] sm:text-[72px] leading-none tracking-[0.04em]',
};
const SEAL: Record<'sm' | 'md' | 'lg' | 'hero', number> = { sm: 20, md: 20, lg: 40, hero: 64 };

export function Wordmark({
  variant = 'lockup',
  size = 'md',
  subline,
  className = '',
  foil = false,
}: {
  variant?: 'lockup' | 'mark' | 'text';
  size?: 'sm' | 'md' | 'lg' | 'hero';
  subline?: string;
  className?: string;
  /** Render the VERIBUS wordmark in champagne foil (metallic gradient). */
  foil?: boolean;
}) {
  const foilCls = foil ? 'foil-text foil-anim' : '';
  if (variant === 'mark') {
    return <Seal size={SEAL[size]} className={className || 'text-sig-info'} />;
  }
  if (variant === 'text') {
    return <span className={`font-semibold ${TEXT[size]} ${foilCls} ${className}`}>VERIBUS</span>;
  }
  return (
    <span className={`flex items-center gap-2 ${size === 'hero' ? 'gap-4' : 'gap-2'} ${className}`}>
      <Seal size={SEAL[size]} className="shrink-0 text-sig-info" />
      <span className="leading-tight">
        <span className={`block font-semibold ${TEXT[size]} ${foilCls}`}>VERIBUS</span>
        {subline && <span className={`block ${size === 'hero' ? 'mt-1 text-14 sm:text-16' : 'text-11'} text-ink-500`}>{subline}</span>}
      </span>
    </span>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export function RailLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  const path = usePathname();
  const active = path === href || (href !== '/' && path.startsWith(href + '/'));

  return (
    <Link
      href={href}
      className={`relative flex items-center gap-2.5 rounded-ops px-2.5 py-2 text-13 transition-colors duration-120 ease-instrument ${
        active
          ? 'bg-gold/10 text-ink-100'
          : 'text-ink-400 hover:bg-ink-800/60 hover:text-ink-200'
      }`}
    >
      {/* Active indicator — 2px accent bar on the left edge */}
      {active && (
        <span
          className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full bg-sig-info"
          aria-hidden
        />
      )}
      {children}
      <span>{label}</span>
    </Link>
  );
}

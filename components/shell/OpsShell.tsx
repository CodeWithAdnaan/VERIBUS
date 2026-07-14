import type { ReactNode } from 'react';
import Link from 'next/link';
import { Rail, type NavItem } from './Rail';
import { Wordmark } from '@/components/brand/Wordmark';
import { MobileNav } from './MobileNav';

// Ops surface (School / RTO / Admin): --ink-950 ground, dense, left icon+label rail.
// An instrument, not a SaaS landing page (§16).
// Mobile: hamburger collapses sidebar into a sheet overlay.
export function OpsShell({
  navItems,
  title,
  subtitle,
  user,
  statusBar,
  children,
}: {
  navItems: NavItem[];
  title: string;
  subtitle?: string;
  user?: { full_name: string; role: string } | null;
  statusBar?: ReactNode;
  children: ReactNode;
}) {
  const SidebarContent = (
    <>
      <Rail items={navItems} />
      {user && (
        <div className="mt-auto border-t border-ink-800 px-3 py-3 text-11">
          <div className="text-ink-200">{user.full_name}</div>
          <div className="text-ink-500">{user.role}</div>
        </div>
      )}
    </>
  );

  return (
    <div className="surface-ops min-h-screen">
      <MobileNav>{SidebarContent}</MobileNav>

      {/* Desktop layout */}
      <div className="hidden md:grid md:grid-cols-[210px_1fr]">
        <aside className="sticky top-0 flex h-screen flex-col border-r border-gold/10 bg-gradient-to-b from-ink-900 to-ink-950">
          <Link href="/" className="block border-b border-gold/15 px-3 py-3">
            <Wordmark
              variant="lockup"
              size="sm"
              subline="School Transport Integrity"
              className="text-ink-100"
              foil
            />
          </Link>
          {SidebarContent}
        </aside>

        <main className="relative min-h-screen">
          {/* Faint champagne vignette on the working surface — depth, not decoration. */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-gold/[0.04] to-transparent"
            aria-hidden
          />
          <header className="relative border-b border-gold/12 px-6 py-3">
            <h1 className="text-16 font-semibold text-ink-100">{title}</h1>
            {subtitle && <p className="text-12 text-ink-400">{subtitle}</p>}
          </header>
          {statusBar}
          <div className="relative p-6">{children}</div>
        </main>
      </div>

      {/* Mobile content (visible below md when sidebar is collapsed) */}
      <div className="md:hidden">
        <div className="border-b border-ink-800 px-4 py-2">
          <h1 className="text-14 font-semibold text-ink-100">{title}</h1>
          {subtitle && <p className="text-11 text-ink-400">{subtitle}</p>}
        </div>
        {statusBar}
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

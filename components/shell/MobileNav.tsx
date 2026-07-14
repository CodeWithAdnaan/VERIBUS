'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { Wordmark } from '@/components/brand/Wordmark';

export function MobileNav({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile header (below md) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-800 bg-ink-900 px-4 py-3 md:hidden">
        <Link href="/" className="text-ink-100">
          <Wordmark variant="lockup" size="sm" subline="School Transport Integrity" className="text-ink-100" />
        </Link>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-ops border border-ink-700 bg-ink-800 p-1.5 text-ink-300 transition-colors hover:text-ink-100"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileOpen ? <X size={20} strokeWidth={1.5} /> : <Menu size={20} strokeWidth={1.5} />}
        </button>
      </header>

      {/* Mobile nav overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 top-[53px] z-20 md:hidden">
          <div
            className="absolute inset-0 bg-ink-950/80"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <nav className="relative border-r border-ink-800 bg-ink-900 w-64 h-full overflow-y-auto">
            {/* When a link is clicked, we need to close the menu. Since Rail is passed as children, 
                we'll just use a capture click handler on the nav container to close it. */}
            <div onClick={(e) => {
              if ((e.target as HTMLElement).closest('a')) {
                setMobileOpen(false);
              }
            }}>
              {children}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}

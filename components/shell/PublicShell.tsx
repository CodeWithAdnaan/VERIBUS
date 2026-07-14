import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Wordmark } from '@/components/brand/Wordmark';

// Public surface (Parent / Driver): warm paper, single column, calm and slow (§16).
export function PublicShell({
  title,
  children,
  back,
}: {
  title?: string;
  children: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="surface-public min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[480px] flex-col px-4 py-5">
        <header className="mb-4 flex items-center justify-between border-b border-gold/30 pb-3">
          <Link href="/" className="block text-ink-900">
            <Wordmark variant="lockup" size="md" />
          </Link>
          {back && (
            <Link
              href={back.href}
              className="inline-flex items-center gap-1 text-12 text-ink-500 hover:text-ink-700"
            >
              <ArrowLeft size={14} strokeWidth={1.5} aria-hidden />
              {back.label}
            </Link>
          )}
        </header>
        {title && <h1 className="mb-3 font-display text-[27px] font-semibold leading-tight text-ink-900">{title}</h1>}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

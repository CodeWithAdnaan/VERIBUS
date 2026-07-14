import Link from 'next/link';
import { Search } from 'lucide-react';
import { Seal } from '@/components/brand/Seal';
import { Wordmark } from '@/components/brand/Wordmark';

export const metadata = { title: 'VERIBUS — Verify evidence' };

// Public index for the chain-verification page. The real entry is /verify/[hash],
// which an inspection memo's QR code points to. No PII is ever shown here.
export default function VerifyIndex() {
  async function go(formData: FormData) {
    'use server';
    const { redirect } = await import('next/navigation');
    const hash = String(formData.get('hash') ?? '').trim();
    if (hash) redirect(`/verify/${encodeURIComponent(hash)}`);
    redirect('/verify');
  }

  return (
    <div className="surface-public flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-[480px]">
        <div className="flex flex-col items-center text-center">
          <Seal size={56} className="text-sig-info" />
          <Link href="/" className="mt-3 text-ink-900">
            <Wordmark variant="text" size="lg" />
          </Link>
          <p className="mt-1 text-12 text-ink-500">Evidence verification</p>
        </div>

        <div className="mt-8">
          <h1 className="text-26 font-semibold text-ink-900">Verify evidence</h1>
          <p className="mt-2 text-14 leading-relaxed text-ink-700">
            Every inspection memo carries a QR code that points here. Scanning it recomputes the
            record&apos;s tamper-evident hash chain and reports whether it is intact — with no personal
            data, no location, and no names.
          </p>

          <form action={go} className="mt-5 flex gap-2">
            <input
              name="hash"
              placeholder="Paste an evidence hash…"
              className="tnum flex-1 rounded-counter border border-ink-300 bg-white px-3 py-2.5 text-13 text-ink-900 outline-none focus:border-sig-info transition-colors"
            />
            <button className="inline-flex items-center gap-1.5 rounded-counter bg-sig-info px-4 py-2.5 text-13 font-semibold text-white transition-colors hover:brightness-[1.08]">
              <Search size={15} strokeWidth={1.75} aria-hidden /> Verify
            </button>
          </form>

          <div className="mt-4 rounded-counter border border-ink-200 bg-paper-2 p-3">
            <p className="text-12 leading-relaxed text-ink-600">
              This page is public by design — a record can be checked against the ledger by anyone,
              without exposing anything sensitive. The chain uses SHA-256 hashes; any altered record
              breaks the chain at the exact sequence where it was changed.
            </p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="text-12 text-ink-500 underline underline-offset-2 hover:text-ink-700">
            Back to overview
          </Link>
        </div>
      </div>
    </div>
  );
}

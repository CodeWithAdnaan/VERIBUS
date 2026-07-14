import Link from 'next/link';
import { ArrowLeft, MessageCircleQuestion, Tags } from 'lucide-react';
import { PilotGap } from '@/components/ui/PilotGap';
import { PILOT_GAPS } from '@/lib/pilotGaps';

// The /limitations page. Aggregates every declared pilot gap. This is deliberately a
// FEATURE, not an apology: a system that states its own limits is the one a department
// can trust. Ops surface, long-form and readable.
export const metadata = {
  title: 'Limitations — VERIBUS',
};

export default function LimitationsPage() {
  return (
    <main className="min-h-screen bg-ink-950 px-4 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-12 text-ink-400 hover:text-ink-200"
        >
          <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
          Overview
        </Link>

        <header className="mt-6">
          <p className="text-11 font-medium uppercase tracking-[0.12em] text-ink-400">
            Limitations
          </p>
          <h1 className="mt-2 text-26 font-semibold leading-tight text-ink-100">
            What this system does not do — stated out loud.
          </h1>
          <p className="mt-3 max-w-2xl text-14 leading-relaxed text-ink-300">
            This is not a disclaimer buried in a footer. A system that states its own limits is
            the one a department can trust. Every gap below is a place a real deployment would
            need something this pilot does not have — named plainly, with the seam where the real
            thing would slot in, and never faked.
          </p>
        </header>

        {/* Where AI is used — the two-places-only rule. */}
        <section className="mt-8 rounded-ops border border-ink-700 bg-ink-900 p-4">
          <h2 className="text-11 font-medium uppercase tracking-[0.08em] text-ink-300">
            Where AI is used
          </h2>
          <p className="mt-2 text-14 leading-relaxed text-ink-300">
            AI is used only where deterministic rules genuinely fail — in exactly two places.
            Everywhere else, the logic is explicit, versioned and testable, because a compliance
            decision must be explainable.
          </p>
          <ul className="mt-3 space-y-3">
            <li className="flex gap-2.5">
              <MessageCircleQuestion
                size={16}
                strokeWidth={1.75}
                className="mt-0.5 shrink-0 text-ink-400"
                aria-hidden
              />
              <div>
                <p className="text-14 font-medium text-ink-100">Plain-language questions (RTO “Ask”)</p>
                <p className="mt-0.5 text-12 leading-relaxed text-ink-400">
                  An officer can ask for a summary in ordinary language. The answer is drawn from
                  the same compliance data the dashboards show — it never invents figures, and the
                  raw tables remain the source of truth.
                </p>
              </div>
            </li>
            <li className="flex gap-2.5">
              <Tags
                size={16}
                strokeWidth={1.75}
                className="mt-0.5 shrink-0 text-ink-400"
                aria-hidden
              />
              <div>
                <p className="text-14 font-medium text-ink-100">Suggesting a complaint category</p>
                <p className="mt-0.5 text-12 leading-relaxed text-ink-400">
                  Free-text a parent writes is hard to bucket by rule, so a category is suggested
                  and shown as “AI-suggested — pending review”. The manual dropdown is always the
                  fallback, and a human confirms before anything counts.
                </p>
              </div>
            </li>
          </ul>
          <p className="mt-3 text-12 leading-relaxed text-ink-400">
            Notably, automatic face-blur is <span className="text-ink-200">not</span> one of these.
            Complaint photos use a manual blur brush that blocks upload until faces are covered —
            we never ship an automated safeguard we cannot guarantee.
          </p>
        </section>

        {/* Every declared pilot gap. */}
        <section className="mt-8">
          <h2 className="text-11 font-medium uppercase tracking-[0.08em] text-ink-300">
            Declared pilot gaps
          </h2>
          <ol className="mt-3 space-y-4">
            {PILOT_GAPS.map((gap, i) => (
              <li key={gap.id} className="flex gap-3">
                <span className="tnum mt-2 w-6 shrink-0 text-12 text-ink-500">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <PilotGap id={gap.id} />
                  <p className="mt-1.5 pl-1 text-11 uppercase tracking-[0.06em] text-ink-500">
                    Surfaces in: <span className="text-ink-400">{gap.where}</span>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <footer className="mt-10 border-t border-ink-800 pt-4">
          <p className="text-12 leading-relaxed text-ink-500">
            Nothing here is hidden from the department, the school, or the parent. Naming a gap is
            how the honest version of a system earns the right to be trusted with a child&apos;s data.
          </p>
        </footer>
      </div>
    </main>
  );
}

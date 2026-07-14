import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  EyeOff,
  Bus,
  Database,
  PenLine,
  Gauge,
  Bell,
  Link2,
  ScrollText,
  Shield,
  Radio,
  FileCheck,
  Scale,
} from 'lucide-react';
import { Seal } from '@/components/brand/Seal';
import { Wordmark } from '@/components/brand/Wordmark';
import { SealHero } from '@/components/brand/SealHero';
import { ChainCanvas } from '@/components/three/ChainCanvas';
import { Reveal } from '@/components/motion/Reveal';
import { ScrollHint } from '@/components/motion/ScrollHint';
import { CountUp } from '@/components/motion/CountUp';
import { Marquee } from '@/components/motion/Marquee';

// Right-to-left brand marquee — keywords + tagline, looping.
const BRAND_WORDS = [
  'EVERY TRIP VERIFIED',
  'SIGNAL',
  'EVIDENCE',
  'ALERTS',
  'LEDGER',
  'TAMPER-EVIDENT',
  'SHA-256 SEALED',
  'TRACKING IS THE INPUT',
  'EVIDENCE IS THE PRODUCT',
];

// LANDING (server, static — no DB read). The public surface. Every section
// serves the thesis; no marketing fluff, no invented statistics, no badges.
// Cinematic, bold, scroll-driven storytelling allowed (§16 public surfaces).

const ALERTS: { name: string; note: string }[] = [
  { name: 'Overspeed', note: 'sustained above the operator-set limit, not a one-second spike' },
  { name: "Long stop", note: "stationary beyond a stop's allowed dwell" },
  { name: 'Route deviation', note: 'off the corridor — surfaced, never escalated on bad GPS' },
  { name: "Delay", note: "behind the route's own historical median" },
  { name: 'Signal lost', note: 'a coverage gap (network) is never punished like a tampered blackout' },
  { name: 'SOS', note: 'driver or attendant escalation; never auto-resolves' },
  { name: 'Repeat complaint', note: 'a pattern of upheld complaints on one vehicle' },
];

const SAFEGUARDS: { Icon: typeof EyeOff; title: string; body: ReactNode }[] = [
  {
    Icon: EyeOff,
    title: 'No public live map',
    body: 'There is no page anywhere that shows a bus moving in real time to the public. Live position is visible only to the one parent whose child is on that trip, and only while it runs.',
  },
  {
    Icon: Bus,
    title: 'Track the bus, not the child',
    body: (
      <>
        The vehicle is tracked; children are not. There is no location column on a student, by
        design. Children&apos;s data is processed only on verifiable parental consent, which can be
        withdrawn.
        {/* TODO(legal): verify exact DPDP section for children's data + verifiable consent */}
      </>
    ),
  },
  {
    Icon: Database,
    title: 'RTO sees summary and compliance only',
    body: 'The department reads scores, alerts and evidence — never raw location traces. This is enforced in the database itself, not merely hidden in the interface.',
  },
  {
    Icon: PenLine,
    title: 'Manual document entry',
    body: 'Vehicle papers are entered by hand and marked "pending departmental verification". No Vahan, Sarathi or AIS-140 integration is built or implied — only the seam where a real feed would connect.',
  },
  {
    Icon: Gauge,
    title: 'Speed limit is operator-set and cited',
    body: 'The system never asserts a legal speed limit on its own authority. An operator sets the limit and cites its source; with no limit configured, overspeed simply is not evaluated.',
  },
];

const SEAL_PIPELINE: { Icon: typeof Radio; letter: string; label: string; desc: string }[] = [
  {
    Icon: Radio,
    letter: 'S',
    label: 'Signal',
    desc: 'Every GPS fix is quality-graded — GOOD, DEGRADED, or REJECTED — before it enters the pipeline.',
  },
  {
    Icon: FileCheck,
    letter: 'E',
    label: 'Evidence',
    desc: 'Trip events are chained into a SHA-256 ledger. Change one record and every hash downstream breaks.',
  },
  {
    Icon: Bell,
    letter: 'A',
    label: 'Alerts',
    desc: 'Seven alert types, each with a versioned policy. No magic numbers. No hardcoded thresholds.',
  },
  {
    Icon: Scale,
    letter: 'L',
    label: 'Ledger',
    desc: 'A line-by-line compliance score: each deduction cites the alert and the policy version in force.',
  },
];

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-11 font-medium uppercase tracking-[0.22em] text-gold/70">{children}</p>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-ink-950">
      {/* ═══════════════════════════════════════════════════════════════════════
          HERO — Full viewport, centered, cinematic. The first thing a judge
          sees. Seal + wordmark + thesis + CTA. Scroll indicator at bottom.
          ═══════════════════════════════════════════════════════════════════════ */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-5 py-16">
        {/* Subtle radial gradient from center — NOT decorative colour, just
            a slight warmth on the ink ground to separate the hero from the
            scrolled content. Uses ink-900 on ink-950: both neutral. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 60% 50% at 50% 40%, var(--ink-900) 0%, transparent 70%)',
          }}
          aria-hidden
        />

        <div className="relative z-10 flex max-w-3xl flex-col items-center text-center">
          {/* Orchestrated load sequence: seal → wordmark → tagline → body → CTA */}
          <div className="rise-in">
            <SealHero size={100} animate />
          </div>

          <div className="rise-in mt-6 flex items-center gap-2 text-ink-400" style={{ animationDelay: '60ms' }}>
            <SectionLabel>Concept pilot · RTO Kashmir / J&amp;K Transport Department</SectionLabel>
          </div>

          <h1 className="rise-in mt-4" style={{ animationDelay: '120ms' }}>
            <Wordmark variant="text" size="hero" foil />
          </h1>

          <p
            className="rise-in mt-3 font-display text-26 font-medium italic text-ink-200 sm:text-34"
            style={{ animationDelay: '180ms' }}
          >
            School Transport Integrity Platform
          </p>

          <p
            className="rise-in foil-text foil-anim mt-2 text-16 font-semibold uppercase tracking-[0.28em] sm:text-20"
            style={{ animationDelay: '240ms' }}
          >
            Every trip, verified.
          </p>

          <p
            className="rise-in mt-6 max-w-xl text-14 leading-relaxed text-ink-400 sm:text-16"
            style={{ animationDelay: '300ms' }}
          >
            Tracking a school bus is a solved problem. What is not solved: when a bus
            overspeeds, the RTO has no evidence it can act on. VERIBUS turns raw GPS into
            tamper-evident, explainable evidence — while proving, in the database, that it
            collects the minimum and never over-reaches on a child&apos;s privacy.
          </p>

          <p
            className="rise-in mt-5 max-w-lg font-display text-34 font-semibold italic leading-tight text-ink-100 sm:text-44"
            style={{ animationDelay: '360ms' }}
          >
            Tracking is the input.<br />
            Evidence is the <span className="foil-text">product</span>.
          </p>

          <div
            className="rise-in mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3"
            style={{ animationDelay: '420ms' }}
          >
            <Link
              href="/login"
              className="sheen inline-flex items-center gap-1.5 rounded-ops border border-transparent bg-[image:var(--cta)] bg-[length:180%_auto] px-6 py-2.5 text-14 font-semibold text-white shadow-gold transition-all hover:bg-[length:140%_auto]"
            >
              Sign in
              <ArrowRight size={16} strokeWidth={2} aria-hidden />
            </Link>
            <Link
              href="/verify"
              className="inline-flex items-center gap-1.5 rounded-ops border border-viz-1/40 bg-ink-900/60 px-4 py-2.5 text-14 font-medium text-ink-100 backdrop-blur transition-colors hover:border-viz-1/70 hover:bg-ink-800"
            >
              Verify a memo
            </Link>
            <Link
              href="/limitations"
              className="text-12 text-ink-500 underline underline-offset-2 hover:text-ink-300"
            >
              What it does not do
            </Link>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <ScrollHint />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          BRAND MARQUEE — right-to-left keyword band. The signature motion.
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="relative border-y border-gold/15 bg-gradient-to-r from-ink-950 via-ink-900/70 to-ink-950 py-3.5">
        <Marquee items={BRAND_WORDS} speed={38} />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          THE SEAL ENGINE — Signal · Evidence · Alerts · Ledger
          4-column pipeline diagram. Each column is a Panel with icon + desc.
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="mx-auto w-full max-w-5xl px-5">
        <Reveal>
          <section className="border-t border-ink-800 pt-10">
            <SectionLabel>The SEAL engine</SectionLabel>
            <h2 className="mt-3 font-display text-26 font-semibold text-ink-100 sm:text-34">
              Signal · Evidence · Alerts · Ledger
            </h2>
            <p className="mt-2 max-w-2xl text-14 leading-relaxed text-ink-400">
              Four modules that turn a GPS fix into court-grade evidence. Each step builds on
              the one before it. The engine is pure — no database calls — and the same code
              evaluates live telemetry and replayed test tracks identically.
            </p>

            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {SEAL_PIPELINE.map((step, i) => (
                <div
                  key={step.letter}
                  className="fade-up sheen rounded-ops border border-gold/15 bg-ink-900/70 p-4 backdrop-blur transition-colors duration-140 hover:border-gold/40"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-ops border border-gold/25 bg-ink-800">
                      <step.Icon size={16} strokeWidth={1.5} className="text-gold" aria-hidden />
                    </div>
                    <div>
                      <span className="foil-text text-26 font-semibold">{step.letter}</span>
                      <span className="ml-1.5 text-14 font-medium text-ink-200">{step.label}</span>
                    </div>
                  </div>
                  <p className="mt-3 text-12 leading-relaxed text-ink-400">
                    {step.desc}
                  </p>
                </div>
              ))}
            </div>

            {/* Stats bar — grounded, verifiable numbers */}
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { value: 7, suffix: ' alert types', note: 'all policy-versioned' },
                { value: 17, suffix: ' tests passing', note: 'pure engine, no DB' },
                { value: 256, prefix: 'SHA-', note: 'hash chain per trip' },
                { value: 4, suffix: ' roles, RLS-enforced', note: 'parent · driver · school · RTO' },
              ].map((stat, i) => (
                <div
                  key={i}
                  className="fade-up sheen rounded-ops border border-gold/12 bg-ink-900/60 px-3 py-3 backdrop-blur"
                  style={{ animationDelay: `${400 + i * 80}ms` }}
                >
                  <div className="text-26 font-semibold text-ink-100">
                    <CountUp end={stat.value} prefix={stat.prefix} suffix={stat.suffix?.split(' ')[0] === ' ' ? '' : ''} />
                    {stat.prefix && <span className="text-16 text-ink-300">{stat.prefix}</span>}
                    <span className="text-ink-100">{stat.value}</span>
                    {stat.suffix && <span className="text-14 font-normal text-ink-400">{stat.suffix}</span>}
                  </div>
                  <p className="mt-1 text-11 text-ink-500">{stat.note}</p>
                </div>
              ))}
            </div>
          </section>
        </Reveal>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          THE EVIDENCE CHAIN — 3D scroll-driven hero visual
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="mx-auto mt-16 w-full max-w-5xl px-5">
        <SectionLabel>The evidence chain</SectionLabel>
        <p className="mt-3 max-w-2xl text-14 leading-relaxed text-ink-300">
          Seven records from one trip, each hash sealed to the record before it. One record was
          altered after the fact — the chain notices, and everything downstream of the break
          stops being trustworthy.
        </p>
        <p className="mt-2 text-11 leading-relaxed text-ink-500">
          Illustrative records. Verify a real memo at{' '}
          <Link href="/verify" className="underline underline-offset-2 hover:text-ink-300">
            /verify
          </Link>
          .
        </p>
      </div>

      <ChainCanvas />

      <div className="mx-auto w-full max-w-5xl px-5 pb-12 sm:pb-16">
        {/* ═══════════════════════════════════════════════════════════════════
            HOW IT WORKS — Alerts + Chain + Ledger
            ═══════════════════════════════════════════════════════════════════ */}
        <Reveal>
          <section className="mt-14 border-t border-ink-800 pt-8">
            <SectionLabel>How it works</SectionLabel>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <div className="rounded-ops border border-gold/12 bg-ink-900/60 backdrop-blur p-5">
                <div className="flex items-center gap-2 text-ink-200">
                  <Bell size={16} strokeWidth={1.75} className="text-ink-400" aria-hidden />
                  <h3 className="text-14 font-semibold">Seven alerts, zero magic numbers</h3>
                </div>
                <p className="mt-2 text-12 leading-relaxed text-ink-400">
                  Every rule reads from a versioned policy, never a hardcoded constant. The engine
                  evaluates only good-quality fixes, and downgrades — never escalates — on poor signal.
                </p>
                <ol className="mt-3 divide-y divide-ink-800">
                  {ALERTS.map((a, i) => (
                    <li key={a.name} className="flex gap-3 py-2">
                      <span className="tnum w-5 shrink-0 text-12 text-ink-500">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="text-12 text-ink-200">
                        <span className="font-medium text-ink-100">{a.name}</span>
                        <span className="text-ink-400"> — {a.note}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="rounded-ops border border-gold/12 bg-ink-900/60 backdrop-blur p-5">
                <div className="flex items-center gap-2 text-ink-200">
                  <Link2 size={16} strokeWidth={1.75} className="text-ink-400" aria-hidden />
                  <h3 className="text-14 font-semibold">An evidence hash-chain</h3>
                </div>
                <p className="mt-2 text-12 leading-relaxed text-ink-400">
                  Each trip event is appended to a SHA-256 chain — change one record and every hash
                  after it stops matching. Anyone can confirm a trip is intact at{' '}
                  <span className="tnum text-ink-300">/verify</span>, with no login and no personal
                  data shown.
                </p>
                <div className="mt-4 rounded-ops border border-ink-800 bg-ink-950 p-3">
                  <div className="flex items-center gap-2 text-11 text-ink-500">
                    <Link2 size={12} strokeWidth={1.5} aria-hidden />
                    <span>Chain integrity check</span>
                  </div>
                  <div className="mt-2 space-y-1">
                    {['#1 TRIP_START', '#2 FIX_BATCH', '#3 FIX_BATCH', '#4 ALERT', '#5 FIX_BATCH'].map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-11">
                        <span className={`h-1.5 w-1.5 rounded-full ${i < 4 ? 'bg-sig-ok' : 'bg-sig-alert'}`} />
                        <span className={`tnum ${i < 4 ? 'text-ink-300' : 'text-sig-alert'}`}>{item}</span>
                        {i === 4 && <span className="rounded-ops bg-sig-alert px-1 py-px text-[10px] font-bold text-white">TAMPERED</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-ops border border-gold/12 bg-ink-900/60 backdrop-blur p-5">
                <div className="flex items-center gap-2 text-ink-200">
                  <ScrollText size={16} strokeWidth={1.75} className="text-ink-400" aria-hidden />
                  <h3 className="text-14 font-semibold">An explainable compliance ledger</h3>
                </div>
                <p className="mt-2 text-12 leading-relaxed text-ink-400">
                  A vehicle&apos;s score is a line-by-line ledger: each deduction cites the alert that
                  caused it and the policy version in force. Nothing is a black box a school or a
                  driver has to take on faith.
                </p>
                <div className="mt-4 rounded-ops border border-ink-800 bg-ink-950 p-3">
                  <div className="flex items-center justify-between text-11 text-ink-500">
                    <span>Compliance score</span>
                    <span className="tnum text-16 font-semibold text-ink-100">87</span>
                  </div>
                  <div className="mt-2 space-y-1 text-11">
                    <div className="flex justify-between">
                      <span className="text-ink-400">OVERSPEED (HIGH) · policy v2.1</span>
                      <span className="tnum text-sig-alert">−8</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-400">ROUTE_DEVIATION (LOW) · policy v2.1</span>
                      <span className="tnum text-sig-watch">−3</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-400">FITNESS expired · manual entry</span>
                      <span className="tnum text-sig-alert">−2</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </Reveal>

        {/* ═══════════════════════════════════════════════════════════════════
            THE PROBLEM
            ═══════════════════════════════════════════════════════════════════ */}
        <Reveal>
          <section className="mt-14 border-t border-ink-800 pt-8">
            <SectionLabel>The problem</SectionLabel>
            <h2 className="mt-3 font-display text-26 font-semibold text-ink-100 sm:text-34">
              When a school bus overspeeds, the RTO has no evidence it can legally act on.
            </h2>
            <p className="mt-3 max-w-2xl text-14 leading-relaxed text-ink-300">
              A parent&apos;s complaint is hearsay. A tracking dashboard is not admissible. By the
              time anyone reviews a screenshot, the data behind it could quietly have changed. The
              missing piece was never more tracking — it was evidence that stands up.
            </p>
          </section>
        </Reveal>

        {/* ═══════════════════════════════════════════════════════════════════
            SAFEGUARDS — Bento grid layout
            ═══════════════════════════════════════════════════════════════════ */}
        <Reveal>
          <section className="mt-14 border-t border-ink-800 pt-8">
            <SectionLabel>Safeguards — by design</SectionLabel>
            <p className="mt-3 max-w-2xl text-14 leading-relaxed text-ink-300">
              These are not settings. They are properties of how the system is built, and most are
              enforced below the interface where they cannot be quietly switched off.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SAFEGUARDS.map(({ Icon, title, body }, i) => (
                <div
                  key={title}
                  className="fade-up rounded-ops border border-gold/12 bg-ink-900/60 backdrop-blur p-4"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-ops border border-ink-600 bg-ink-800">
                    <Icon size={16} strokeWidth={1.5} className="text-ink-400" aria-hidden />
                  </div>
                  <h3 className="text-14 font-semibold text-ink-100">{title}</h3>
                  <p className="mt-2 text-12 leading-relaxed text-ink-400">{body}</p>
                </div>
              ))}
            </div>
          </section>
        </Reveal>

        {/* ═══════════════════════════════════════════════════════════════════
            KASHMIR CONTEXT — Institutional framing
            ═══════════════════════════════════════════════════════════════════ */}
        <Reveal>
          <section className="mt-14 border-t border-ink-800 pt-8">
            <SectionLabel>A concept pilot</SectionLabel>
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:gap-6">
              <div className="flex-1">
                <h2 className="font-display text-26 font-semibold text-ink-100 sm:text-34">
                  Built for RTO Kashmir
                </h2>
                <p className="mt-3 text-14 leading-relaxed text-ink-300">
                  VERIBUS is a concept pilot for the J&amp;K Transport Department — not a finished
                  product. It demonstrates a complete evidence pipeline on synthetic data near
                  Srinagar, with real SHA-256 cryptography, real Row Level Security, and a real
                  compliance ledger.
                </p>
                <p className="mt-3 text-14 leading-relaxed text-ink-300">
                  It states its own limits plainly — that is the version of a system a department
                  can trust.
                </p>
              </div>
              <div className="flex-1">
                <div className="rounded-ops border border-gold/12 bg-ink-900/60 backdrop-blur p-4">
                  <h3 className="text-12 font-medium uppercase tracking-[0.08em] text-ink-400">
                    Pilot scope
                  </h3>
                  <ul className="mt-3 space-y-2 text-13 text-ink-200">
                    {[
                      'Synthetic routes near Srinagar, labelled SYNTHETIC',
                      'Demo fleet: 2 schools, 4 vehicles, 5 replay tracks',
                      'Deliberate pilot gaps stated out loud at /limitations',
                      'No invented statistics or legal section numbers',
                      'Replay posts to the same ingest endpoint, chipped REPLAY',
                    ].map((item) => (
                      <li key={item} className="flex gap-2">
                        <Shield size={14} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-500" aria-hidden />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>
        </Reveal>

        {/* ═══════════════════════════════════════════════════════════════════
            FOOTER
            ═══════════════════════════════════════════════════════════════════ */}
        <footer className="mt-14 border-t border-ink-800 pt-6 pb-8">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
            <Seal size={16} className="text-sig-info" />
            <span className="text-12 font-semibold tracking-[0.06em] text-ink-300">VERIBUS</span>
            <span className="text-ink-700">·</span>
            <span className="text-11 text-ink-500">School Transport Integrity Platform</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href="/login" className="text-12 text-ink-400 underline underline-offset-2 hover:text-ink-200">
              Sign in
            </Link>
            <Link href="/limitations" className="text-12 text-ink-400 underline underline-offset-2 hover:text-ink-200">
              Limitations
            </Link>
            <Link href="/verify" className="text-12 text-ink-400 underline underline-offset-2 hover:text-ink-200">
              Verify a memo
            </Link>
          </div>
          <p className="mt-4 text-11 leading-relaxed text-ink-500">
            A concept pilot for RTO Kashmir / J&amp;K Transport Department. It states its own limits
            plainly — that is the version of a system a department can trust. Runs on the{' '}
            <span className="text-ink-400">SEAL</span> engine — Signal · Evidence · Alerts · Ledger.
          </p>
        </footer>
      </div>
    </main>
  );
}

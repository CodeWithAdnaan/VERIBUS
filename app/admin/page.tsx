'use client';

// Admin index (ops surface). Renders inside app/admin/layout.tsx → OpsShell.
// The "Run schedule sweep" button is a client POST to /api/cron/watchdog, so the
// whole index is a client component (no DB reads live here — just links + one POST).
import { useState } from 'react';
import Link from 'next/link';
import { PlayCircle, Trash2, TriangleAlert, RefreshCw, ArrowRight } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { fmtTime } from '@/lib/format';

interface SweepResult {
  swept_at?: string;
  active_reevaluated?: number;
  trips_not_started?: number;
  error?: string;
  message?: string;
}

const TOOLS: { href: string; label: string; desc: string; Icon: typeof PlayCircle }[] = [
  {
    href: '/admin/replay',
    label: 'Replay harness',
    desc: 'Stream a recorded track into the SAME ingest endpoint the phone uses. Flagged source:REPLAY — never disguised as live.',
    Icon: PlayCircle,
  },
  {
    href: '/admin/retention',
    label: 'Retention',
    desc: 'Show the active data-retention window and run a demo purge of aged trips. We keep telemetry no longer than policy.',
    Icon: Trash2,
  },
  {
    href: '/admin/tamper',
    label: 'Tamper (DEV)',
    desc: 'Deliberately corrupt one evidence record to prove the chain detects it. Dev-only; not part of the product.',
    Icon: TriangleAlert,
  },
];

export default function AdminIndexPage() {
  const [sweep, setSweep] = useState<SweepResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function runSweep() {
    setBusy(true);
    setSweep(null);
    try {
      const res = await fetch('/api/cron/watchdog', { method: 'POST' });
      const json = (await res.json()) as SweepResult;
      if (!res.ok) {
        setSweep({ error: json.error ?? 'SWEEP_FAILED', message: json.message ?? `HTTP ${res.status}` });
      } else {
        setSweep(json);
      }
    } catch (e) {
      setSweep({ error: 'NETWORK', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* LOUD synthetic-geometry warning — hazard stripe + solid panel so text stays legible. */}
      <div className="overflow-hidden rounded-ops border border-sig-alert/50 bg-ink-900">
        <div className="hazard-band h-2 w-full" aria-hidden />
        <div className="flex items-start gap-2 px-4 py-3">
          <TriangleAlert size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-sig-alert" aria-hidden />
          <div>
            <p className="text-13 font-bold uppercase tracking-[0.06em] text-ink-100">
              Synthetic route geometry
            </p>
            <p className="mt-0.5 text-12 leading-relaxed text-ink-300">
              The seeded routes are hand-approximated, not surveyed. Replace{' '}
              <code className="rounded bg-ink-950/60 px-1 py-0.5 font-mono text-ink-200">
                /seed/routes/*.geojson
              </code>{' '}
              with real drawn routes before the demo. Corridor and deviation results are only as
              honest as this geometry.
            </p>
          </div>
        </div>
      </div>

      <Panel
        title="Demo & operations tools"
        subtitle="Not role-gated in the pilot so a presenter can drive it. Production requires platform_admin."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((t) => {
            const { Icon } = t;
            return (
              <Link
                key={t.href}
                href={t.href}
                className="group flex flex-col gap-2 rounded-ops border border-ink-700 bg-ink-950/40 p-3 transition-colors hover:border-ink-600 hover:bg-ink-800/40"
              >
                <div className="flex items-center gap-2 text-ink-100">
                  <Icon size={16} strokeWidth={1.75} className="text-sig-info" aria-hidden />
                  <span className="text-13 font-medium">{t.label}</span>
                  <ArrowRight
                    size={14}
                    strokeWidth={1.75}
                    className="ml-auto text-ink-500 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </div>
                <p className="text-12 leading-relaxed text-ink-400">{t.desc}</p>
              </Link>
            );
          })}
        </div>
      </Panel>

      <Panel
        title="Schedule sweep"
        subtitle="Re-evaluates every ACTIVE trip (signal gaps + tamper) and raises TRIP_NOT_STARTED for schedules past grace."
        actions={
          <Button variant="primary" onClick={runSweep} disabled={busy}>
            <RefreshCw size={14} strokeWidth={1.75} className={busy ? 'animate-spin' : ''} aria-hidden />
            {busy ? 'Sweeping…' : 'Run schedule sweep'}
          </Button>
        }
      >
        <p className="mb-2 text-12 leading-relaxed text-ink-400">
          In production this runs on a cron on deploy (
          <span className="text-ink-300">a monitoring system that only sees compliant drivers monitors nothing</span>
          ). Here it runs on demand.
        </p>

        {!sweep && (
          <p className="text-12 text-ink-500">No sweep run this session yet.</p>
        )}

        {sweep?.error && (
          <div className="rounded-ops border border-sig-alert/50 bg-sig-alert/[0.06] px-3 py-2">
            <div className="flex items-center gap-2">
              <Chip variant="alert">SWEEP FAILED</Chip>
              <span className="tnum text-12 text-ink-300">{sweep.error}</span>
            </div>
            <p className="mt-1 text-12 text-ink-400">{sweep.message}</p>
          </div>
        )}

        {sweep && !sweep.error && (
          <div className="rounded-ops border border-ink-700 bg-ink-950/40 px-3 py-2">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <div className="text-11 uppercase tracking-[0.06em] text-ink-500">Active re-evaluated</div>
                <div className="tnum text-16 text-ink-100">{sweep.active_reevaluated ?? 0}</div>
              </div>
              <div>
                <div className="text-11 uppercase tracking-[0.06em] text-ink-500">Trips not started</div>
                <div
                  className={`tnum text-16 ${
                    (sweep.trips_not_started ?? 0) > 0 ? 'text-sig-watch' : 'text-ink-100'
                  }`}
                >
                  {sweep.trips_not_started ?? 0}
                </div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-11 uppercase tracking-[0.06em] text-ink-500">Swept at</div>
                <div className="tnum text-12 text-ink-300">{fmtTime(sweep.swept_at)}</div>
              </div>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

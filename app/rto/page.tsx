import Link from 'next/link';
import { Panel } from '@/components/ui/Panel';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { FleetStrip, type FleetRow } from '@/components/charts/FleetStrip';
import { RadialGauge } from '@/components/charts/RadialGauge';
import { Bars } from '@/components/charts/Bars';
import { requireProfile } from '@/lib/server/auth';
import { serviceClient } from '@/lib/supabase/server';
import { computeVehicleLedger } from '@/lib/server/ledger';
import { DOCUMENT_CHIP } from '@/lib/adapters/documentSource';
import { fmtDateTime, isExpired } from '@/lib/format';
import { Lock, ShieldCheck, AlertTriangle, Bus, Gauge, FileWarning } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface SummaryRow {
  id: string;
  registration_no: string;
  bus_code: string;
  school_name: string;
  district: string;
  high_conf_alerts_90d: number;
  fitness_expiry: string | null;
  permit_expiry: string | null;
  insurance_expiry: string | null;
  puc_expiry: string | null;
  doc_source: string;
}

interface RecentAlert {
  id: string;
  vehicle_id: string;
  type: string;
  confidence: string;
  started_at: string;
  summary: string;
}

const DOC_KEYS: (keyof SummaryRow)[] = [
  'fitness_expiry',
  'permit_expiry',
  'insurance_expiry',
  'puc_expiry',
];

function expiredDocCount(row: SummaryRow): number {
  return DOC_KEYS.reduce((n, k) => n + (isExpired(row[k] as string | null) ? 1 : 0), 0);
}

export default async function RtoOverviewPage() {
  await requireProfile(['rto_officer']);
  const now = new Date().toISOString();

  let summary: SummaryRow[] = [];
  const scores: Record<string, number> = {};
  let recent: RecentAlert[] = [];
  let failed = false;

  try {
    const client = serviceClient();
    const { data } = await client
      .from('rto_vehicle_summary')
      .select(
        'id, registration_no, bus_code, school_name, district, high_conf_alerts_90d, fitness_expiry, permit_expiry, insurance_expiry, puc_expiry, doc_source'
      );
    summary = (data ?? []) as SummaryRow[];

    // Compliance score for the seeded fleet — reproducible from events + policy.
    const ledgers = await Promise.all(
      summary.map(async (v) => ({
        id: v.id,
        score: (await computeVehicleLedger(client, v.id, now)).ledger.final,
      }))
    );
    for (const r of ledgers) scores[r.id] = r.score;

    const { data: alertData } = await client
      .from('alerts')
      .select('id, vehicle_id, type, confidence, started_at, summary')
      .eq('confidence', 'HIGH')
      .order('started_at', { ascending: false })
      .limit(8);
    recent = (alertData ?? []) as RecentAlert[];
  } catch {
    failed = true;
  }

  if (failed) {
    return (
      <Panel title="District overview">
        <EmptyState title="District summary is unavailable" icon={<AlertTriangle size={28} strokeWidth={1.5} />}>
          The compliance summary could not be loaded. The RTO surface reads only summary and
          compliance data — never raw location — so there is nothing sensitive waiting behind this
          screen.
        </EmptyState>
      </Panel>
    );
  }

  const busCode: Record<string, string> = {};
  summary.forEach((v) => (busCode[v.id] = v.bus_code));

  // ── Summary stats ──────────────────────────────────────────────────────────
  const totalVehicles = summary.length;
  const totalHighConf = summary.reduce((n, v) => n + (v.high_conf_alerts_90d ?? 0), 0);
  const totalExpiredDocs = summary.filter((v) => expiredDocCount(v) > 0).length;
  const allScores = Object.values(scores);
  const avgScore = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 100;

  // ── District tiles ─────────────────────────────────────────────────────────
  const districts = Array.from(new Set(summary.map((v) => v.district))).sort();
  const tiles = districts.map((d) => {
    const rows = summary.filter((v) => v.district === d);
    const highConf = rows.reduce((n, v) => n + (v.high_conf_alerts_90d ?? 0), 0);
    const expiredDocs = rows.filter((v) => expiredDocCount(v) > 0).length;
    const lowest = rows.reduce(
      (min, v) => Math.min(min, scores[v.id] ?? 100),
      100
    );
    return { d, vehicles: rows.length, highConf, expiredDocs, lowest };
  });

  const fleetRows: FleetRow[] = summary.map((v) => ({
    id: v.id,
    label: v.bus_code,
    sublabel: v.school_name,
    score: scores[v.id] ?? 100,
    href: `/rto/vehicle/${v.id}`,
  }));

  // Compliance-band distribution — computed from the scores already derived
  // above (no extra query, nothing invented).
  const BANDS: { label: string; min: number; max: number }[] = [
    { label: '<60', min: 0, max: 60 },
    { label: '60s', min: 60, max: 70 },
    { label: '70s', min: 70, max: 80 },
    { label: '80s', min: 80, max: 90 },
    { label: '90+', min: 90, max: 101 },
  ];
  const distribution = BANDS.map((b) => ({
    label: b.label,
    value: allScores.filter((s) => s >= b.min && s < b.max).length,
  }));

  return (
    <div className="space-y-6">
      {/* RLS / privacy panel */}
      <div className="flex items-start gap-3 rounded-ops border border-gold/12 bg-ink-900/60 backdrop-blur px-4 py-3">
        <Lock size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-sig-info" aria-hidden />
        <div className="text-13 leading-relaxed text-ink-200">
          <span className="font-medium text-ink-100">
            RTO access is summary-only — raw breadcrumbs are invisible to this role, enforced by Row
            Level Security.
          </span>{' '}
          The database, not the interface, decides what this role may read. Vehicle telemetry has no
          RTO select policy at all.{' '}
          <Link href="/limitations" className="text-sig-info underline decoration-ink-600 underline-offset-2 hover:decoration-sig-info">
            See the pilot limitations
          </Link>
          .
        </div>
      </div>

      {/* ── Summary stat cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-ops border border-gold/12 bg-ink-900/60 backdrop-blur px-4 py-3">
          <div className="flex items-center gap-2">
            <Bus size={14} strokeWidth={1.5} className="text-ink-500" aria-hidden />
            <span className="text-11 uppercase tracking-[0.08em] text-ink-500">Vehicles</span>
          </div>
          <div className="mt-2 tnum text-26 font-semibold text-ink-100">{totalVehicles}</div>
        </div>
        <div className="rounded-ops border border-gold/12 bg-ink-900/60 backdrop-blur px-4 py-3">
          <div className="flex items-center gap-2">
            <Gauge size={14} strokeWidth={1.5} className="text-ink-500" aria-hidden />
            <span className="text-11 uppercase tracking-[0.08em] text-ink-500">Avg score</span>
          </div>
          <div className={`mt-2 tnum text-26 font-semibold ${avgScore >= 85 ? 'text-ink-100' : avgScore >= 65 ? 'text-sig-watch' : 'text-sig-alert'}`}>
            {avgScore}
          </div>
        </div>
        <div className="rounded-ops border border-gold/12 bg-ink-900/60 backdrop-blur px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} strokeWidth={1.5} className="text-ink-500" aria-hidden />
            <span className="text-11 uppercase tracking-[0.08em] text-ink-500">High alerts (90d)</span>
          </div>
          <div className={`mt-2 tnum text-26 font-semibold ${totalHighConf > 0 ? 'text-sig-watch' : 'text-ink-100'}`}>
            {totalHighConf}
          </div>
        </div>
        <div className="rounded-ops border border-gold/12 bg-ink-900/60 backdrop-blur px-4 py-3">
          <div className="flex items-center gap-2">
            <FileWarning size={14} strokeWidth={1.5} className="text-ink-500" aria-hidden />
            <span className="text-11 uppercase tracking-[0.08em] text-ink-500">Expired docs</span>
          </div>
          <div className={`mt-2 tnum text-26 font-semibold ${totalExpiredDocs > 0 ? 'text-sig-alert' : 'text-ink-100'}`}>
            {totalExpiredDocs}
          </div>
        </div>
      </div>

      {/* ── Fleet compliance at a glance — gauge + distribution ─────────── */}
      <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
        <Panel title="Fleet compliance" subtitle="District average" bodyClassName="flex items-center justify-center p-6">
          <RadialGauge value={avgScore} label="Avg score" sublabel={`${totalVehicles} vehicles`} />
        </Panel>
        <Panel title="Score distribution" subtitle="Vehicles by compliance band">
          <Bars data={distribution} height={132} />
        </Panel>
      </div>

      {/* District tiles */}
      <section>
        <h2 className="mb-3 text-11 font-medium uppercase tracking-[0.1em] text-gold/70">
          Districts
        </h2>
        {tiles.length === 0 ? (
          <Panel title="Districts">
            <EmptyState title="No districts on record">
              Vehicles appear here once a school is onboarded. Nothing is inferred about a child or a
              route — only the fleet and its compliance.
            </EmptyState>
          </Panel>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tiles.map((t) => (
              <div key={t.d} className="rounded-ops border border-gold/12 bg-ink-900/60 backdrop-blur p-4 transition-colors duration-120 hover:border-gold/40">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} strokeWidth={1.5} className="text-ink-400" aria-hidden />
                  <span className="text-14 font-semibold text-ink-100">{t.d}</span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-12">
                  <div>
                    <dt className="text-ink-500">Vehicles</dt>
                    <dd className="tnum text-16 text-ink-100">{t.vehicles}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">Lowest score</dt>
                    <dd
                      className={`tnum text-16 ${
                        t.lowest >= 85 ? 'text-ink-100' : t.lowest >= 65 ? 'text-sig-watch' : 'text-sig-alert'
                      }`}
                    >
                      {Math.round(t.lowest)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">High-conf alerts (90d)</dt>
                    <dd className={`tnum text-16 ${t.highConf > 0 ? 'text-sig-watch' : 'text-ink-100'}`}>
                      {t.highConf}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">Vehicles w/ expired docs</dt>
                    <dd className={`tnum text-16 ${t.expiredDocs > 0 ? 'text-sig-alert' : 'text-ink-100'}`}>
                      {t.expiredDocs}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Fleet strip */}
      <Panel
        title="Fleet by compliance score"
        subtitle="Worst-first. Score is a rulebook deduction ledger, reproducible from events + policy."
        actions={<Chip variant="manual">{DOCUMENT_CHIP}</Chip>}
      >
        {fleetRows.length === 0 ? (
          <EmptyState title="No vehicles to rank">
            The fleet is empty. There is nothing to score, and nothing about any child is stored to
            infer from.
          </EmptyState>
        ) : (
          <FleetStrip rows={fleetRows} />
        )}
      </Panel>

      {/* Recent high-confidence alerts */}
      <Panel
        title="Recent high-confidence alerts"
        subtitle="Aggregated violation windows only — never the raw track."
      >
        {recent.length === 0 ? (
          <EmptyState title="No high-confidence alerts" icon={<ShieldCheck size={28} strokeWidth={1.5} />}>
            Silence is the default state. A clear board means the fleet is behaving — not that data is
            missing.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-ink-800">
            {recent.map((a, i) => (
              <li
                key={a.id}
                className="alert-in flex items-center gap-3 py-2.5 text-13"
                style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
              >
                <span className="tnum w-20 shrink-0 font-medium text-ink-100">{busCode[a.vehicle_id] ?? '—'}</span>
                <Chip variant="watch">{a.type}</Chip>
                <span className="min-w-0 flex-1 truncate text-ink-300">{a.summary}</span>
                <span className="tnum shrink-0 text-11 text-ink-500">{fmtDateTime(a.started_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

import Link from 'next/link';
import { Panel } from '@/components/ui/Panel';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { PilotGap } from '@/components/ui/PilotGap';
import { FleetStrip, type FleetRow } from '@/components/charts/FleetStrip';
import { requireProfile } from '@/lib/server/auth';
import { serviceClient } from '@/lib/supabase/server';
import { computeVehicleLedger } from '@/lib/server/ledger';
import { DOCUMENT_CHIP } from '@/lib/adapters/documentSource';
import { isExpired } from '@/lib/format';
import { AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface SummaryRow {
  id: string;
  registration_no: string;
  bus_code: string;
  school_name: string;
  high_conf_alerts_90d: number;
  fitness_expiry: string | null;
  permit_expiry: string | null;
  insurance_expiry: string | null;
  puc_expiry: string | null;
}

const DOC_FIELDS: { label: string; key: keyof SummaryRow }[] = [
  { label: 'Fitness', key: 'fitness_expiry' },
  { label: 'Permit', key: 'permit_expiry' },
  { label: 'Insurance', key: 'insurance_expiry' },
  { label: 'PUC', key: 'puc_expiry' },
];

export default async function RtoVehiclesPage() {
  await requireProfile(['rto_officer']);
  const now = new Date().toISOString();

  let summary: SummaryRow[] = [];
  const scores: Record<string, number> = {};
  let failed = false;

  try {
    const client = serviceClient();
    const { data } = await client
      .from('rto_vehicle_summary')
      .select(
        'id, registration_no, bus_code, school_name, high_conf_alerts_90d, fitness_expiry, permit_expiry, insurance_expiry, puc_expiry'
      );
    summary = (data ?? []) as SummaryRow[];
    const ledgers = await Promise.all(
      summary.map(async (v) => ({
        id: v.id,
        score: (await computeVehicleLedger(client, v.id, now)).ledger.final,
      }))
    );
    for (const r of ledgers) scores[r.id] = r.score;
  } catch {
    failed = true;
  }

  if (failed) {
    return (
      <Panel title="Fleet compliance">
        <EmptyState title="Fleet compliance is unavailable" icon={<AlertTriangle size={28} strokeWidth={1.5} />}>
          The compliance strip could not be loaded. This surface never held raw location to begin
          with — only summary and compliance data.
        </EmptyState>
      </Panel>
    );
  }

  const fleetRows: FleetRow[] = summary.map((v) => ({
    id: v.id,
    label: v.bus_code,
    sublabel: v.school_name,
    score: scores[v.id] ?? 100,
    href: `/rto/vehicle/${v.id}`,
  }));

  // Detail rows, also worst-first, to carry alert counts + doc flags the strip can't.
  const detail = [...summary].sort((a, b) => (scores[a.id] ?? 100) - (scores[b.id] ?? 100));

  return (
    <div className="space-y-6">
      <Panel
        title="Fleet by compliance score"
        subtitle="Worst-first — the order an officer needs. Score is a reproducible deduction ledger, not a model."
      >
        {fleetRows.length === 0 ? (
          <EmptyState title="No vehicles to rank">
            The fleet is empty. Nothing about any child or route is stored to infer from — only the
            fleet and its compliance appear here.
          </EmptyState>
        ) : (
          <FleetStrip rows={fleetRows} />
        )}
      </Panel>

      <Panel
        title="High-confidence alerts & document flags"
        subtitle="90-day high-confidence alert counts and manually-entered document expiries."
        actions={<Chip variant="manual">{DOCUMENT_CHIP}</Chip>}
      >
        {detail.length === 0 ? (
          <EmptyState title="No vehicles on record">
            When a school is onboarded its buses appear here. Documents are typed by a human and marked
            pending departmental verification — never scraped from a fake integration.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-13">
              <thead>
                <tr className="border-b border-ink-700 text-left text-11 uppercase tracking-[0.06em] text-ink-500">
                  <th className="py-2 pr-3 font-medium">Vehicle</th>
                  <th className="py-2 pr-3 font-medium">School</th>
                  <th className="py-2 pr-3 text-right font-medium">Score</th>
                  <th className="py-2 pr-3 text-right font-medium">High-conf (90d)</th>
                  <th className="py-2 font-medium">Document flags</th>
                </tr>
              </thead>
              <tbody>
                {detail.map((v) => {
                  const score = Math.round(scores[v.id] ?? 100);
                  const expired = DOC_FIELDS.filter((f) => isExpired(v[f.key] as string | null));
                  return (
                    <tr key={v.id} className="border-b border-ink-800 hover:bg-ink-800/50">
                      <td className="py-2 pr-3">
                        <Link
                          href={`/rto/vehicle/${v.id}`}
                          className="tnum text-ink-100 underline decoration-ink-700 underline-offset-2 hover:decoration-sig-info"
                        >
                          {v.bus_code}
                        </Link>
                        <div className="tnum text-11 text-ink-500">{v.registration_no}</div>
                      </td>
                      <td className="py-2 pr-3 text-ink-300">{v.school_name}</td>
                      <td
                        className={`tnum py-2 pr-3 text-right ${
                          score >= 85 ? 'text-ink-100' : score >= 65 ? 'text-sig-watch' : 'text-sig-alert'
                        }`}
                      >
                        {score}
                      </td>
                      <td
                        className={`tnum py-2 pr-3 text-right ${
                          (v.high_conf_alerts_90d ?? 0) > 0 ? 'text-sig-watch' : 'text-ink-400'
                        }`}
                      >
                        {v.high_conf_alerts_90d ?? 0}
                      </td>
                      <td className="py-2">
                        {expired.length === 0 ? (
                          <span className="text-11 text-ink-500">All current</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {expired.map((f) => (
                              <Chip key={f.key} variant="alert">
                                {f.label} expired
                              </Chip>
                            ))}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3">
          <PilotGap id="departmental-feeds" />
        </div>
      </Panel>
    </div>
  );
}

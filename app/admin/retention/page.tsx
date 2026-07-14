// Retention policy + demo purge. Server component; the purge is an inline server
// action (no client JS, no extra endpoint). Honest by construction: it deletes WHOLE
// aged trips (cascading their telemetry + evidence chain), never individual evidence
// records — evidence is append-only. Raw telemetry past its shorter window is dropped
// separately. The result of a run is the newest row in the history table.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { revalidatePath } from 'next/cache';
import { Trash2, ShieldCheck } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PilotGap } from '@/components/ui/PilotGap';
import { serviceClient } from '@/lib/supabase/server';
import { getActivePolicy } from '@/lib/server/policy';
import { fmtDateTime } from '@/lib/format';

const DAY = 86_400_000;

interface RunRow {
  id: string;
  run_at: string;
  telemetry_rows_purged: number;
  trips_purged: number;
  policy: { raw_telemetry_days?: number; evidence_days?: number } | null;
}

// ── Server action: run the demo purge ────────────────────────────────────────
async function runPurge(): Promise<void> {
  'use server';
  try {
    const client = serviceClient();
    const policy = await getActivePolicy(client);
    const { raw_telemetry_days, evidence_days } = policy.rules.retention;
    const now = Date.now();
    const rawCutoff = new Date(now - raw_telemetry_days * DAY).toISOString();
    const evidenceCutoff = new Date(now - evidence_days * DAY).toISOString();

    // Tier 1 — raw telemetry past the telemetry window (keeps the trip + evidence chain).
    const { count: rawCount } = await client
      .from('telemetry')
      .select('id', { count: 'exact', head: true })
      .lt('device_ts', rawCutoff);
    await client.from('telemetry').delete().lt('device_ts', rawCutoff);

    // Tier 2 — whole finished trips past the evidence window (cascade removes their
    // telemetry + evidence + alerts). Never touches ACTIVE trips.
    const { data: oldTrips } = await client
      .from('trips')
      .select('id')
      .in('status', ['COMPLETED', 'ABORTED', 'MISSED'])
      .lt('ended_at', evidenceCutoff);
    const tripIds = (oldTrips ?? []).map((t) => t.id as string);
    let tripTelemetry = 0;
    if (tripIds.length > 0) {
      const { count } = await client
        .from('telemetry')
        .select('id', { count: 'exact', head: true })
        .in('trip_id', tripIds);
      tripTelemetry = count ?? 0;
      await client.from('trips').delete().in('id', tripIds);
    }

    await client.from('retention_runs').insert({
      telemetry_rows_purged: (rawCount ?? 0) + tripTelemetry,
      trips_purged: tripIds.length,
      policy: policy.rules.retention,
    });
  } catch {
    // Never crash the action; the page re-renders and shows whatever is in the DB.
  }
  revalidatePath('/admin/retention');
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function RetentionPage() {
  let rawDays: number | null = null;
  let evidenceDays: number | null = null;
  let policyVersion = '';
  let runs: RunRow[] = [];
  let loadFailed = false;

  try {
    const client = serviceClient();
    const policy = await getActivePolicy(client);
    rawDays = policy.rules.retention.raw_telemetry_days;
    evidenceDays = policy.rules.retention.evidence_days;
    policyVersion = policy.version;
    const { data } = await client
      .from('retention_runs')
      .select('id, run_at, telemetry_rows_purged, trips_purged, policy')
      .order('run_at', { ascending: false })
      .limit(20);
    runs = (data ?? []) as RunRow[];
  } catch {
    loadFailed = true;
  }

  const latest = runs[0] ?? null;

  return (
    <div className="flex flex-col gap-5">
      <Panel
        title="Active retention policy"
        subtitle={policyVersion ? `From policy_config ${policyVersion} — read from the DB, never hardcoded.` : undefined}
      >
        {loadFailed ? (
          <EmptyState icon={<ShieldCheck size={26} strokeWidth={1.5} />} title="Policy unavailable">
            The active policy could not be read. Retention windows are only ever taken from{' '}
            <code className="font-mono">policy_config</code> — the app asserts no window of its own.
          </EmptyState>
        ) : (
          <div className="flex flex-wrap gap-8">
            <div>
              <div className="text-11 uppercase tracking-[0.06em] text-ink-500">Raw telemetry kept</div>
              <div className="tnum text-20 text-ink-100">
                {rawDays} <span className="text-13 text-ink-400">days</span>
              </div>
              <p className="mt-1 max-w-xs text-11 leading-relaxed text-ink-500">
                Precise lat/lng points are the most sensitive data we hold; they age out first.
              </p>
            </div>
            <div>
              <div className="text-11 uppercase tracking-[0.06em] text-ink-500">Evidence kept</div>
              <div className="tnum text-20 text-ink-100">
                {evidenceDays} <span className="text-13 text-ink-400">days</span>
              </div>
              <p className="mt-1 max-w-xs text-11 leading-relaxed text-ink-500">
                Tamper-evident summaries (hashes, alerts) outlive raw points, then the whole trip goes.
              </p>
            </div>
          </div>
        )}
      </Panel>

      <Panel
        title="Run purge (demo)"
        subtitle="Applies the windows above right now, and logs a retention_runs row."
        actions={
          <form action={runPurge}>
            <Button variant="danger" type="submit" disabled={loadFailed}>
              <Trash2 size={14} strokeWidth={1.75} aria-hidden />
              Run purge (demo)
            </Button>
          </form>
        }
      >
        <PilotGap title="what this deletes">
          It deletes <span className="text-ink-200">whole aged trips</span> — their telemetry,
          evidence chain, and alerts together — never an individual evidence record. Evidence is
          append-only; we can only ever drop an entire trip, never quietly edit one. Raw telemetry
          past the shorter window is dropped separately, keeping the trip's evidence intact.
        </PilotGap>

        {latest && (
          <div className="mt-3 rounded-ops border border-ink-700 bg-ink-950/40 px-3 py-2">
            <div className="text-11 uppercase tracking-[0.06em] text-ink-500">Last run</div>
            <div className="mt-1 flex flex-wrap items-center gap-6">
              <div>
                <span className="tnum text-16 text-ink-100">{latest.telemetry_rows_purged}</span>{' '}
                <span className="text-12 text-ink-400">telemetry rows purged</span>
              </div>
              <div>
                <span className="tnum text-16 text-ink-100">{latest.trips_purged}</span>{' '}
                <span className="text-12 text-ink-400">whole trips purged</span>
              </div>
              <span className="tnum ml-auto text-11 text-ink-500">{fmtDateTime(latest.run_at)}</span>
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Purge history" bodyClassName="p-0">
        {runs.length === 0 ? (
          <EmptyState icon={<Trash2 size={26} strokeWidth={1.5} />} title="Nothing purged yet">
            Retention runs appear here. An empty history is the honest default — we do not delete
            data until policy says the window has closed.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-12">
              <thead>
                <tr className="border-b border-ink-700 text-11 uppercase tracking-[0.06em] text-ink-500">
                  <th className="px-3 py-2 font-medium">Run at</th>
                  <th className="px-3 py-2 text-right font-medium">Telemetry rows</th>
                  <th className="px-3 py-2 text-right font-medium">Trips</th>
                  <th className="px-3 py-2 text-right font-medium">Window (raw / evidence)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800">
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="tnum px-3 py-2 text-ink-300">{fmtDateTime(r.run_at)}</td>
                    <td className="tnum px-3 py-2 text-right text-ink-200">{r.telemetry_rows_purged}</td>
                    <td className="tnum px-3 py-2 text-right text-ink-200">{r.trips_purged}</td>
                    <td className="tnum px-3 py-2 text-right text-ink-400">
                      {r.policy?.raw_telemetry_days ?? '—'} / {r.policy?.evidence_days ?? '—'} d
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { Panel } from '@/components/ui/Panel';
import { Chip } from '@/components/ui/Chip';
import { Hash } from '@/components/ui/Hash';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { DeductionReceipt } from '@/components/charts/DeductionReceipt';
import { requireProfile } from '@/lib/server/auth';
import { serviceClient } from '@/lib/supabase/server';
import { computeVehicleLedger, alertEventClass, type AlertRow } from '@/lib/server/ledger';
import { DOCUMENT_CHIP } from '@/lib/adapters/documentSource';
import { fmtDate, isExpired, daysUntil } from '@/lib/format';
import { AlertTriangle, FileText, RotateCw } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface VehicleShape {
  bus_code?: string;
  registration_no?: string;
  fitness_expiry?: string | null;
  permit_expiry?: string | null;
  insurance_expiry?: string | null;
  puc_expiry?: string | null;
  speed_governor_fitted?: boolean;
}

const DOC_FIELDS: { label: string; key: keyof VehicleShape }[] = [
  { label: 'Fitness certificate', key: 'fitness_expiry' },
  { label: 'Permit', key: 'permit_expiry' },
  { label: 'Insurance', key: 'insurance_expiry' },
  { label: 'PUC', key: 'puc_expiry' },
];

interface QueueReason {
  text: string;
  evidenceId: string | null;
}

// Plain-language sentences derived from the alert mix, each pointing at its evidence.
function buildReasons(alerts: AlertRow[]): QueueReason[] {
  const scored = alerts.filter(
    (a) => a.status !== 'DISMISSED' && alertEventClass(a.type, a.subtype) !== null
  );
  const groups = new Map<string, AlertRow[]>();
  for (const a of scored) {
    const ec = alertEventClass(a.type, a.subtype)!;
    const list = groups.get(ec) ?? [];
    list.push(a);
    groups.set(ec, list);
  }

  const phrase: Record<string, (n: number, hi: number) => string> = {
    OVERSPEED: (n, hi) =>
      `Overspeed was recorded ${n} time${n === 1 ? '' : 's'} (${hi} high-confidence): the bus held a speed beyond the configured limit and tolerance for a sustained window.`,
    SIGNAL_TAMPER: (n) =>
      `The monitoring signal dropped in a pattern classified as possible tampering ${n} time${n === 1 ? '' : 's'} — kept distinct from a coverage gap, which carries no penalty.`,
    TRIP_NOT_STARTED: (n) =>
      `A scheduled trip was never started on the app ${n} time${n === 1 ? '' : 's'}; evading monitoring is penalised more heavily than any single violation it would have caught.`,
    ROUTE_DEVIATION: (n) =>
      `The bus left its approved corridor ${n} time${n === 1 ? '' : 's'} beyond the sustained-deviation threshold.`,
    LONG_STOP: (n) =>
      `An unexplained long stop was recorded ${n} time${n === 1 ? '' : 's'} outside the allowed dwell.`,
    DELAY: (n) =>
      `The trip ran materially behind its own historical median ${n} time${n === 1 ? '' : 's'}.`,
    COVERAGE_GAP: (n) =>
      `Coverage was lost to the network ${n} time${n === 1 ? '' : 's'} — logged for transparency, but scored at zero: a driver is never punished for Kashmir's network.`,
  };

  const reasons: QueueReason[] = [];
  const order = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [ec, list] of order) {
    const make = phrase[ec];
    if (!make) continue;
    const hi = list.filter((a) => a.confidence === 'HIGH').length;
    const withEvidence = list.find((a) => a.evidence_id) ?? list[0];
    reasons.push({ text: make(list.length, hi), evidenceId: withEvidence?.evidence_id ?? null });
    if (reasons.length >= 5) break;
  }
  return reasons;
}

export default async function RtoVehicleLedgerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireProfile(['rto_officer']);
  const { id } = await params;
  const now = new Date().toISOString();

  async function recompute() {
    'use server';
    // The score is reproducible from events + policy; re-render recomputes it identically.
    revalidatePath(`/rto/vehicle/${id}`);
  }

  let result: Awaited<ReturnType<typeof computeVehicleLedger>> | null = null;
  try {
    result = await computeVehicleLedger(serviceClient(), id, now);
  } catch {
    result = null;
  }

  if (!result || !result.vehicle) {
    return (
      <Panel title="Vehicle compliance ledger">
        <EmptyState title="This vehicle could not be loaded" icon={<AlertTriangle size={28} strokeWidth={1.5} />}>
          No compliance ledger is available for this vehicle. The RTO surface holds only summary data,
          so nothing sensitive is hidden behind this notice.
        </EmptyState>
      </Panel>
    );
  }

  const vehicle = result.vehicle as VehicleShape;
  const { ledger, alerts, policyVersion } = result;
  const reasons = buildReasons(alerts);
  const expiredDocs = DOC_FIELDS.filter((f) => isExpired(vehicle[f.key] as string | null));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="tnum text-20 font-semibold text-ink-100">{vehicle.bus_code ?? 'Vehicle'}</h1>
          <p className="tnum text-12 text-ink-400">{vehicle.registration_no ?? '—'}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-ops border border-ink-700 bg-ink-900 px-2 py-1 text-11 text-ink-300">
            Policy version{' '}
            <span className="tnum ml-1 font-semibold text-ink-100">{policyVersion}</span>
          </span>
          <Link href={`/rto/memo/${id}`}>
            <Button variant="primary">
              <FileText size={14} strokeWidth={1.75} aria-hidden />
              Inspection memo
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Deduction receipt */}
        <Panel
          title="Deduction ledger"
          subtitle="Not a donut. Every line links to its evidence record."
          actions={
            <form action={recompute}>
              <Button variant="quiet" type="submit">
                <RotateCw size={13} strokeWidth={1.75} aria-hidden />
                Recompute
              </Button>
            </form>
          }
        >
          <DeductionReceipt ledger={ledger} evidenceHref={(eid) => (eid ? '#' + eid : undefined)} />
          <p className="mt-3 text-11 leading-relaxed text-ink-500">
            Reproducible from events + policy: recompute yields the identical ledger. An inspection
            order cannot be issued on a score nobody can explain. That is why this is a rulebook, not a
            model.
          </p>
        </Panel>

        {/* Why in the queue */}
        <Panel
          title="Why this vehicle is in the inspection queue"
          subtitle="Plain-language reasons, each linked to its evidence."
        >
          {reasons.length === 0 ? (
            <EmptyState title="Nothing to explain — clean compliance">
              This vehicle has no scored violations on record. A clear ledger is the default, not a
              gap in the data.
            </EmptyState>
          ) : (
            <ol className="space-y-3">
              {reasons.map((r, i) => (
                <li key={i} className="flex gap-3 text-13 leading-relaxed">
                  <span className="tnum mt-0.5 shrink-0 text-ink-500">{i + 1}.</span>
                  <div className="min-w-0">
                    <a
                      href={r.evidenceId ? '#' + r.evidenceId : undefined}
                      className="text-ink-200 hover:text-ink-100"
                    >
                      {r.text}
                    </a>
                    {r.evidenceId && (
                      <div className="mt-1">
                        <Hash value={r.evidenceId} />
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      {/* Document status */}
      <Panel
        title="Document status"
        subtitle="Manually entered — a real Vahan / Sarathi feed is a pilot gap, never faked."
        actions={
          expiredDocs.length > 0 ? (
            <Chip variant="alert">{expiredDocs.length} expired</Chip>
          ) : (
            <Chip variant="ok">All current</Chip>
          )
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-13">
            <thead>
              <tr className="border-b border-ink-700 text-left text-11 uppercase tracking-[0.06em] text-ink-500">
                <th className="py-2 pr-3 font-medium">Document</th>
                <th className="py-2 pr-3 font-medium">Expiry</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {DOC_FIELDS.map((f) => {
                const val = vehicle[f.key] as string | null;
                const expired = isExpired(val);
                const days = daysUntil(val);
                return (
                  <tr key={f.key} className="border-b border-ink-800">
                    <td className="py-2 pr-3 text-ink-200">{f.label}</td>
                    <td className="tnum py-2 pr-3 text-ink-300">{fmtDate(val)}</td>
                    <td className="py-2 pr-3">
                      {expired ? (
                        <Chip variant="alert">Expired</Chip>
                      ) : days !== null && days <= 30 ? (
                        <Chip variant="watch">Due in {days}d</Chip>
                      ) : (
                        <Chip variant="ok">Valid</Chip>
                      )}
                    </td>
                    <td className="py-2">
                      <Chip variant="manual">{DOCUMENT_CHIP}</Chip>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

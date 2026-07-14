import { headers } from 'next/headers';
import QRCode from 'qrcode';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { PilotGap } from '@/components/ui/PilotGap';
import { requireProfile } from '@/lib/server/auth';
import { serviceClient } from '@/lib/supabase/server';
import { computeVehicleLedger, type AlertRow } from '@/lib/server/ledger';
import { PrintButton } from './PrintButton';
import { DOCUMENT_CHIP } from '@/lib/adapters/documentSource';
import { fmtDate, fmtDateTime, shortHash, isExpired } from '@/lib/format';
import type { DeductionLedger } from '@/lib/engine/types';
import { AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

const MEMO_NUMBER = 'VERIBUS/JK/2026/0001';
const ISSUING_OFFICE = 'VERIBUS — School Transport Integrity Pilot · Office of the RTO, Srinagar, J&K';

interface VehicleShape {
  school_id?: string;
  bus_code?: string;
  registration_no?: string;
  capacity?: number;
  speed_governor_fitted?: boolean;
  fitness_expiry?: string | null;
  permit_expiry?: string | null;
  insurance_expiry?: string | null;
  puc_expiry?: string | null;
}

const DOC_FIELDS: { label: string; key: keyof VehicleShape }[] = [
  { label: 'Fitness certificate', key: 'fitness_expiry' },
  { label: 'Permit', key: 'permit_expiry' },
  { label: 'Insurance', key: 'insurance_expiry' },
  { label: 'PUC', key: 'puc_expiry' },
];

const CATEGORY_LABEL: Record<string, string> = {
  OVERSPEED: 'Overspeed',
  SIGNAL_TAMPER: 'Signal tamper',
  TRIP_NOT_STARTED: 'Trip not started',
  ROUTE_DEVIATION: 'Route deviation',
  LONG_STOP: 'Long stop',
  DELAY: 'Delay',
  COMPLAINT_UPHELD: 'Upheld complaint',
  DOC_EXPIRED: 'Document expired',
  PRECHECK_FAILED_BLOCKING: 'Pre-check failed',
  COVERAGE_GAP: 'Coverage gap',
};

const SUGGESTED_CHECK: Record<string, string> = {
  OVERSPEED: 'Verify the speed-governor seal and calibration; confirm the fitted governor is functional.',
  SIGNAL_TAMPER: 'Inspect the tracking device mounting and interview the driver on app shutdowns during trips.',
  TRIP_NOT_STARTED: 'Confirm the driver starts the app before departure; review scheduling compliance.',
  ROUTE_DEVIATION: 'Confirm the approved route and any authorised diversions on file.',
  LONG_STOP: 'Ask the operator to account for the unscheduled stop.',
  DELAY: 'Review trip timing against the approved schedule with the operator.',
  COMPLAINT_UPHELD: 'Review the upheld complaint file and confirm remedial action was taken.',
  DOC_EXPIRED: 'Physically verify the fitness, permit, insurance and PUC certificates against originals.',
};

function metricSummary(metrics: Record<string, unknown>): string {
  const entries = Object.entries(metrics ?? {}).filter(([, v]) => v !== null && v !== undefined);
  if (entries.length === 0) return '—';
  return entries
    .slice(0, 2)
    .map(([k, v]) => `${k}=${typeof v === 'number' ? v : String(v)}`)
    .join(', ');
}

// Light serif re-render of the ledger (the shared DeductionReceipt is dark).
function PrintLedger({ ledger }: { ledger: DeductionLedger }) {
  const allLines = [...ledger.lines, ...ledger.doc_lines];
  let running = ledger.base;
  return (
    <table className="w-full border-collapse text-[12px]">
      <tbody>
        <tr className="border-b border-black/30">
          <td className="py-1">Base</td>
          <td className="py-1 text-right tabular-nums">{ledger.base.toFixed(2)}</td>
          <td className="py-1 text-right tabular-nums">{ledger.base.toFixed(2)}</td>
        </tr>
        {allLines.length === 0 && (
          <tr>
            <td colSpan={3} className="py-2 text-center italic text-black/60">
              No deductions on record. Clean compliance.
            </td>
          </tr>
        )}
        {allLines.map((l, i) => {
          running -= l.applied;
          return (
            <tr key={i} className="border-b border-black/10">
              <td className="py-1">
                − {CATEGORY_LABEL[l.event_class] ?? l.event_class}
                <span className="text-black/50">
                  {' '}
                  ({l.raw_weight}×{l.conf_mult}
                  {l.decay_mult !== 1 ? `×${l.decay_mult.toFixed(2)}` : ''}, {fmtDate(l.occurred_at)})
                </span>
              </td>
              <td className="py-1 text-right tabular-nums">
                {l.applied > 0 ? `−${l.applied.toFixed(2)}` : '0.00'}
              </td>
              <td className="py-1 text-right tabular-nums">{running.toFixed(2)}</td>
            </tr>
          );
        })}
        <tr className="border-t-2 border-black">
          <td className="py-1 font-semibold uppercase">Final score</td>
          <td />
          <td className="py-1 text-right text-[16px] font-bold tabular-nums">{ledger.final.toFixed(0)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export default async function InspectionMemoPage({
  params,
}: {
  params: Promise<{ vehicleId: string }>;
}) {
  await requireProfile(['rto_officer']);
  const { vehicleId } = await params;
  const now = new Date().toISOString();

  let result: Awaited<ReturnType<typeof computeVehicleLedger>> | null = null;
  let schoolName = '—';
  let driverName = '—';
  let chainHead: string | null = null;
  const hashById: Record<string, string> = {};
  let qrDataUrl: string | null = null;
  let origin = '';

  try {
    const client = serviceClient();
    result = await computeVehicleLedger(client, vehicleId, now);
    const vehicle = (result.vehicle ?? {}) as VehicleShape;

    if (vehicle.school_id) {
      const { data: school } = await client
        .from('schools')
        .select('name')
        .eq('id', vehicle.school_id)
        .maybeSingle();
      if (school?.name) schoolName = school.name as string;
    }

    const { data: trip } = await client
      .from('trips')
      .select('id, driver_id, chain_head, status, started_at')
      .eq('vehicle_id', vehicleId)
      .order('started_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (trip) {
      chainHead = (trip.chain_head as string | null) ?? null;
      if (trip.driver_id) {
        const { data: driver } = await client
          .from('drivers')
          .select('full_name')
          .eq('id', trip.driver_id)
          .maybeSingle();
        if (driver?.full_name) driverName = driver.full_name as string;
      }
    }

    // Evidence hashes for the top scored alerts.
    const evidenceIds = Array.from(
      new Set(result.ledger.lines.map((l) => l.evidence_id).filter((x): x is string => !!x))
    );
    if (evidenceIds.length > 0) {
      const { data: recs } = await client
        .from('evidence_records')
        .select('id, record_hash')
        .in('id', evidenceIds);
      for (const r of recs ?? []) hashById[r.id as string] = r.record_hash as string;
    }

    const h = await headers();
    const proto = h.get('x-forwarded-proto') ?? 'https';
    const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
    origin = host ? `${proto}://${host}` : '';
    if (chainHead && origin) {
      qrDataUrl = await QRCode.toDataURL(`${origin}/verify/${chainHead}`, {
        margin: 1,
        width: 132,
      });
    }
  } catch {
    result = null;
  }

  if (!result || !result.vehicle) {
    return (
      <Panel title="Inspection memo">
        <EmptyState title="Memo cannot be generated" icon={<AlertTriangle size={28} strokeWidth={1.5} />}>
          No compliance record is available for this vehicle, so no draft memo can be produced. The
          RTO surface holds only summary data.
        </EmptyState>
      </Panel>
    );
  }

  const vehicle = result.vehicle as VehicleShape;
  const { ledger, alerts } = result;
  const alertById: Record<string, AlertRow> = {};
  for (const a of alerts) alertById[a.id] = a;

  // Top 5 evidence items — the largest deductions.
  const topLines = [...ledger.lines].filter((l) => l.applied > 0).sort((a, b) => b.applied - a.applied).slice(0, 5);

  // Suggested checks from the event-class mix.
  const presentClasses = new Set<string>([
    ...ledger.lines.filter((l) => l.applied > 0).map((l) => l.event_class),
    ...ledger.doc_lines.map((l) => l.event_class),
  ]);
  const checks = Array.from(presentClasses)
    .map((ec) => SUGGESTED_CHECK[ec])
    .filter((x): x is string => !!x);

  return (
    <div className="memo-root">
      {/* Print isolation + page setup. Hides the ops shell chrome without touching the layout. */}
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm; }
          html, body { background: #ffffff !important; }
          .no-print { display: none !important; }
          body * { visibility: hidden; }
          .memo-root, .memo-root * { visibility: visible; }
          .memo-root { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>

      {/* Non-removable draft watermark, over the whole page. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-50 flex select-none items-center justify-center overflow-hidden"
      >
        <span className="whitespace-nowrap font-serif text-[42px] font-bold uppercase tracking-[0.12em] text-black/10 [transform:rotate(-30deg)]">
          SYSTEM-GENERATED DRAFT — NOT AN OFFICIAL ORDER
        </span>
      </div>

      {/* Controls (screen only) */}
      <div className="no-print mx-auto mb-4 flex max-w-[820px] items-center justify-between">
        <p className="text-12 text-ink-400">
          Draft inspection memo. Review before printing — this is not an official order.
        </p>
        <PrintButton />
      </div>

      {/* The A4 sheet */}
      <article className="relative z-10 mx-auto max-w-[820px] border border-ink-700 bg-white p-10 font-serif text-[13px] leading-relaxed text-black">
        {/* Header */}
        <header className="border-b-2 border-black pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[18px] font-bold uppercase tracking-wide">Vehicle Inspection Memo</h1>
              <p className="mt-1 text-[12px] text-black/70">{ISSUING_OFFICE}</p>
            </div>
            <div className="text-right text-[12px]">
              <div>
                Memo No. <span className="font-semibold tabular-nums">{MEMO_NUMBER}</span>
              </div>
              <div className="tabular-nums text-black/70">Date: {fmtDate(now)}</div>
            </div>
          </div>
        </header>

        {/* Subject */}
        <section className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-[12px]">
          <div>
            <span className="text-black/60">Vehicle:</span>{' '}
            <span className="font-semibold tabular-nums">{vehicle.bus_code ?? '—'}</span>
          </div>
          <div>
            <span className="text-black/60">Registration:</span>{' '}
            <span className="font-semibold tabular-nums">{vehicle.registration_no ?? '—'}</span>
          </div>
          <div>
            <span className="text-black/60">School:</span>{' '}
            <span className="font-semibold">{schoolName}</span>
          </div>
          <div>
            <span className="text-black/60">Driver (last trip):</span>{' '}
            <span className="font-semibold">{driverName}</span>
          </div>
          <div>
            <span className="text-black/60">Speed governor:</span>{' '}
            <span className="font-semibold">{vehicle.speed_governor_fitted ? 'Fitted' : 'Not fitted'}</span>
          </div>
          <div>
            <span className="text-black/60">Policy version:</span>{' '}
            <span className="font-semibold tabular-nums">{ledger.policy_version}</span>
          </div>
        </section>

        {/* Document status */}
        <section className="mt-5">
          <h2 className="mb-1 text-[13px] font-bold uppercase tracking-wide">Document status</h2>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="py-1 pr-3 font-semibold">Document</th>
                <th className="py-1 pr-3 font-semibold">Expiry</th>
                <th className="py-1 pr-3 font-semibold">Status</th>
                <th className="py-1 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody>
              {DOC_FIELDS.map((f) => {
                const val = vehicle[f.key] as string | null;
                const expired = isExpired(val);
                return (
                  <tr key={f.key} className="border-b border-black/15">
                    <td className="py-1 pr-3">{f.label}</td>
                    <td className="py-1 pr-3 tabular-nums">{fmtDate(val)}</td>
                    <td className="py-1 pr-3">{expired ? 'EXPIRED' : 'Valid'}</td>
                    <td className="py-1 text-black/60">{DOCUMENT_CHIP}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* Top evidence */}
        <section className="mt-5">
          <h2 className="mb-1 text-[13px] font-bold uppercase tracking-wide">Top evidence (up to 5)</h2>
          {topLines.length === 0 ? (
            <p className="text-[12px] italic text-black/60">
              No scored violations on record for this vehicle.
            </p>
          ) : (
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-black text-left">
                  <th className="py-1 pr-3 font-semibold">Timestamp</th>
                  <th className="py-1 pr-3 font-semibold">Type</th>
                  <th className="py-1 pr-3 font-semibold">Key metric</th>
                  <th className="py-1 pr-3 font-semibold">Confidence</th>
                  <th className="py-1 font-semibold">Record hash</th>
                </tr>
              </thead>
              <tbody>
                {topLines.map((l, i) => {
                  const a = l.alert_id ? alertById[l.alert_id] : undefined;
                  const rec = l.evidence_id ? hashById[l.evidence_id] : undefined;
                  return (
                    <tr key={i} className="border-b border-black/15">
                      <td className="py-1 pr-3 tabular-nums">{fmtDateTime(l.occurred_at)}</td>
                      <td className="py-1 pr-3">{CATEGORY_LABEL[l.event_class] ?? l.event_class}</td>
                      <td className="py-1 pr-3 tabular-nums">{a ? metricSummary(a.metrics) : '—'}</td>
                      <td className="py-1 pr-3">{l.confidence}</td>
                      <td className="py-1 font-mono tabular-nums">{rec ? shortHash(rec) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {/* Deduction ledger */}
        <section className="mt-5">
          <h2 className="mb-1 text-[13px] font-bold uppercase tracking-wide">Compliance deduction ledger</h2>
          <PrintLedger ledger={ledger} />
          <p className="mt-1 text-[11px] italic text-black/60">
            Reproducible from events + policy {ledger.policy_version}. An inspection order cannot be
            issued on a score nobody can explain — this is a rulebook, not a model.
          </p>
        </section>

        {/* Suggested checks */}
        <section className="mt-5">
          <h2 className="mb-1 text-[13px] font-bold uppercase tracking-wide">Suggested checks</h2>
          {checks.length === 0 ? (
            <p className="text-[12px] italic text-black/60">
              No specific checks indicated — no scored violations on record.
            </p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-[12px]">
              {checks.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
        </section>

        {/* Officer findings */}
        <section className="mt-5">
          <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wide">Officer findings</h2>
          <div className="space-y-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="border-b border-black/40" style={{ height: '1.1rem' }} />
            ))}
          </div>
        </section>

        {/* Signature + QR */}
        <section className="mt-8 flex items-end justify-between">
          <div className="text-[12px]">
            <div className="mb-6 h-10 w-56 border-b border-black" />
            <div>Inspecting Officer (name &amp; designation)</div>
            <div className="mt-4 mb-6 h-10 w-56 border-b border-black" />
            <div>Signature &amp; official stamp</div>
          </div>
          <div className="text-center text-[11px]">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="Verify chain" width={132} height={132} className="border border-black/20" />
            ) : (
              <div className="flex h-[132px] w-[132px] items-center justify-center border border-dashed border-black/40 p-2 text-black/60">
                No completed trip on record — no chain head to verify.
              </div>
            )}
            <div className="mt-1 text-black/60">
              {chainHead ? (
                <>
                  Verify chain head
                  <br />
                  <span className="font-mono tabular-nums">{shortHash(chainHead)}</span>
                </>
              ) : (
                'Public verification'
              )}
            </div>
          </div>
        </section>

        <div className="no-print mt-6">
          <PilotGap id="departmental-feeds" />
        </div>
      </article>
    </div>
  );
}

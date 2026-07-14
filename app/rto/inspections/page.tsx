import Link from 'next/link';
import { Panel } from '@/components/ui/Panel';
import { EmptyState } from '@/components/ui/EmptyState';
import { requireProfile } from '@/lib/server/auth';
import { serviceClient } from '@/lib/supabase/server';
import { computeVehicleLedger } from '@/lib/server/ledger';
import { isExpired } from '@/lib/format';
import { AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface SummaryRow {
  id: string;
  bus_code: string;
  registration_no: string;
  school_name: string;
  high_conf_alerts_90d: number;
  fitness_expiry: string | null;
  permit_expiry: string | null;
  insurance_expiry: string | null;
  puc_expiry: string | null;
}

const DOC_KEYS: (keyof SummaryRow)[] = [
  'fitness_expiry',
  'permit_expiry',
  'insurance_expiry',
  'puc_expiry',
];

const CATEGORY_LABEL: Record<string, string> = {
  OVERSPEED: 'Overspeed',
  SIGNAL_TAMPER: 'Signal tamper',
  TRIP_NOT_STARTED: 'Trip not started',
  ROUTE_DEVIATION: 'Route deviation',
  LONG_STOP: 'Long stop',
  DELAY: 'Delay',
  COMPLAINT_UPHELD: 'Upheld complaint',
  DOC_EXPIRED: 'Documents expired',
  PRECHECK_FAILED_BLOCKING: 'Pre-check failed',
  COVERAGE_GAP: 'Coverage gap',
};

interface QueueEntry {
  id: string;
  bus_code: string;
  registration_no: string;
  school_name: string;
  score: number;
  highConf: number;
  worst: string;
  expiredDocs: number;
}

export default async function RtoInspectionsPage() {
  await requireProfile(['rto_officer']);
  const now = new Date().toISOString();

  let entries: QueueEntry[] = [];
  let failed = false;

  try {
    const client = serviceClient();
    const { data } = await client
      .from('rto_vehicle_summary')
      .select(
        'id, bus_code, registration_no, school_name, high_conf_alerts_90d, fitness_expiry, permit_expiry, insurance_expiry, puc_expiry'
      );
    const summary = (data ?? []) as SummaryRow[];

    entries = await Promise.all(
      summary.map(async (v) => {
        const { ledger } = await computeVehicleLedger(client, v.id, now);
        const totals = new Map<string, number>();
        for (const l of [...ledger.lines, ...ledger.doc_lines]) {
          if (l.applied <= 0) continue;
          totals.set(l.event_class, (totals.get(l.event_class) ?? 0) + l.applied);
        }
        let worst = '—';
        let worstVal = 0;
        for (const [ec, val] of totals) {
          if (val > worstVal) {
            worstVal = val;
            worst = CATEGORY_LABEL[ec] ?? ec;
          }
        }
        return {
          id: v.id,
          bus_code: v.bus_code,
          registration_no: v.registration_no,
          school_name: v.school_name,
          score: ledger.final,
          highConf: v.high_conf_alerts_90d ?? 0,
          worst,
          expiredDocs: DOC_KEYS.filter((k) => isExpired(v[k] as string | null)).length,
        };
      })
    );
    // Lowest score first; tiebreak on most high-confidence alerts.
    entries.sort((a, b) => a.score - b.score || b.highConf - a.highConf);
  } catch {
    failed = true;
  }

  if (failed) {
    return (
      <Panel title="Inspection queue">
        <EmptyState title="The inspection queue is unavailable" icon={<AlertTriangle size={28} strokeWidth={1.5} />}>
          The queue could not be loaded. It is built only from compliance summaries — no raw location
          is read to rank a vehicle.
        </EmptyState>
      </Panel>
    );
  }

  return (
    <Panel
      title="Inspection queue"
      subtitle="Ranked by lowest compliance score, then most high-confidence alerts. Every rank is explainable."
    >
      {entries.length === 0 ? (
        <EmptyState title="No vehicles to inspect">
          An empty queue is a good day. Buses are ranked only from compliance events — nothing about a
          child's journey is stored to build this list.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-13">
            <thead>
              <tr className="border-b border-ink-700 text-left text-11 uppercase tracking-[0.06em] text-ink-500">
                <th className="py-2 pr-3 text-right font-medium">#</th>
                <th className="py-2 pr-3 font-medium">Vehicle</th>
                <th className="py-2 pr-3 font-medium">School</th>
                <th className="py-2 pr-3 text-right font-medium">Score</th>
                <th className="py-2 pr-3 text-right font-medium">High-conf</th>
                <th className="py-2 pr-3 font-medium">Worst category</th>
                <th className="py-2 pr-3 text-right font-medium">Doc flags</th>
                <th className="py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => {
                const score = Math.round(e.score);
                return (
                  <tr key={e.id} className="border-b border-ink-800 hover:bg-ink-800/50">
                    <td className="tnum py-2 pr-3 text-right text-ink-500">{i + 1}</td>
                    <td className="py-2 pr-3">
                      <Link
                        href={`/rto/vehicle/${e.id}`}
                        className="tnum text-ink-100 underline decoration-ink-700 underline-offset-2 hover:decoration-sig-info"
                      >
                        {e.bus_code}
                      </Link>
                      <div className="tnum text-11 text-ink-500">{e.registration_no}</div>
                    </td>
                    <td className="py-2 pr-3 text-ink-300">{e.school_name}</td>
                    <td
                      className={`tnum py-2 pr-3 text-right ${
                        score >= 85 ? 'text-ink-100' : score >= 65 ? 'text-sig-watch' : 'text-sig-alert'
                      }`}
                    >
                      {score}
                    </td>
                    <td
                      className={`tnum py-2 pr-3 text-right ${
                        e.highConf > 0 ? 'text-sig-watch' : 'text-ink-400'
                      }`}
                    >
                      {e.highConf}
                    </td>
                    <td className="py-2 pr-3 text-ink-300">{e.worst}</td>
                    <td
                      className={`tnum py-2 pr-3 text-right ${
                        e.expiredDocs > 0 ? 'text-sig-alert' : 'text-ink-500'
                      }`}
                    >
                      {e.expiredDocs > 0 ? e.expiredDocs : '—'}
                    </td>
                    <td className="py-2">
                      <Link
                        href={`/rto/memo/${e.id}`}
                        className="text-sig-info underline decoration-ink-600 underline-offset-2 hover:decoration-sig-info"
                      >
                        Memo
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

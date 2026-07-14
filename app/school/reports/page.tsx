import { requireProfile } from '@/lib/server/auth';
import { serviceClient } from '@/lib/supabase/server';
import { computeVehicleLedger } from '@/lib/server/ledger';
import { Panel } from '@/components/ui/Panel';
import { EmptyState } from '@/components/ui/EmptyState';
import { PrintButton } from '@/components/ui/PrintButton';
import { FleetStrip, type FleetRow } from '@/components/charts/FleetStrip';
import { fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const profile = await requireProfile(['school_admin']);
  const now = new Date().toISOString();
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();

  try {
    const client = serviceClient();
    const schoolId = profile.school_id;

    const [{ data: trips }, { data: alerts }, { data: vehicles }] = await Promise.all([
      client.from('trips').select('id, status, started_at').eq('school_id', schoolId),
      client.from('alerts').select('type, started_at').eq('school_id', schoolId).gte('started_at', weekAgo),
      client.from('vehicles').select('id, bus_code, registration_no').eq('school_id', schoolId),
    ]);

    const tripRows = trips ?? [];
    const last7 = tripRows.filter((t) => t.started_at && t.started_at >= weekAgo).length;
    const byStatus = tripRows.reduce<Record<string, number>>((m, t) => ((m[t.status] = (m[t.status] ?? 0) + 1), m), {});
    const alertByType = (alerts ?? []).reduce<Record<string, number>>((m, a) => ((m[a.type] = (m[a.type] ?? 0) + 1), m), {});

    const fleetRows: FleetRow[] = [];
    for (const v of vehicles ?? []) {
      try {
        const { ledger } = await computeVehicleLedger(client, v.id as string, now);
        fleetRows.push({ id: v.id as string, label: v.bus_code as string, sublabel: v.registration_no as string, score: ledger.final, href: `/rto/vehicle/${v.id}` });
      } catch {
        /* skip vehicle on failure */
      }
    }

    return (
      <div className="space-y-4">
        <div className="no-print flex items-center justify-between">
          <p className="text-12 text-ink-400">Weekly summary · generated {fmtDate(now)}</p>
          <PrintButton />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Panel title="Trips"><div className="tnum text-34 text-ink-100">{tripRows.length}</div><div className="text-12 text-ink-400">{last7} in the last 7 days</div></Panel>
          <Panel title="By status">
            <ul className="tnum space-y-0.5 text-13">
              {Object.entries(byStatus).map(([k, n]) => (<li key={k} className="flex justify-between"><span className="text-ink-300">{k}</span><span className="text-ink-100">{n}</span></li>))}
            </ul>
          </Panel>
          <Panel title="Alerts (7 days)">
            {Object.keys(alertByType).length === 0 ? <div className="text-12 text-ink-500">None.</div> : (
              <ul className="tnum space-y-0.5 text-13">
                {Object.entries(alertByType).map(([k, n]) => (<li key={k} className="flex justify-between"><span className="text-ink-300">{k}</span><span className="text-ink-100">{n}</span></li>))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel title="Fleet compliance (worst first)">
          {fleetRows.length === 0 ? <EmptyState title="No vehicles" /> : <FleetStrip rows={fleetRows} />}
        </Panel>
      </div>
    );
  } catch {
    return <EmptyState title="Reports unavailable">Confirm the Supabase connection.</EmptyState>;
  }
}

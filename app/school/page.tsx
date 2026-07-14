import Link from 'next/link';
import { requireProfile } from '@/lib/server/auth';
import { serviceClient } from '@/lib/supabase/server';
import { verifyTripChain } from '@/lib/server/evidence';
import { Panel } from '@/components/ui/Panel';
import { Chip } from '@/components/ui/Chip';
import { StatusBar } from '@/components/ui/StatusBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { fmtTime } from '@/lib/format';
import { Bus, AlertOctagon, RefreshCw, ArrowRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface TripCard {
  id: string;
  direction: string;
  started_at: string | null;
  vehicles: { bus_code: string; registration_no: string } | null;
  routes: { name: string } | null;
}
interface AlertRow {
  id: string;
  trip_id: string;
  type: string;
  subtype: string | null;
  severity: string;
  summary: string;
  started_at: string;
  vehicles: { bus_code: string } | null;
}

export default async function SchoolBoard() {
  const profile = await requireProfile(['school_admin']);
  if (!profile.school_id) return <EmptyState title="No school is linked to this account." />;

  try {
    const client = serviceClient();
    const schoolId = profile.school_id;

    const { data: at } = await client
      .from('trips')
      .select('id, direction, started_at, vehicles(bus_code, registration_no), routes(name)')
      .eq('school_id', schoolId)
      .eq('status', 'ACTIVE')
      .order('started_at', { ascending: false });
    const trips = (at ?? []) as unknown as TripCard[];
    const tripIds = trips.map((t) => t.id);

    let replaySet = new Set<string>();
    if (tripIds.length) {
      const { data: rep } = await client
        .from('telemetry')
        .select('trip_id')
        .in('trip_id', tripIds)
        .eq('source', 'REPLAY')
        .limit(2000);
      replaySet = new Set((rep ?? []).map((r) => r.trip_id as string));
    }

    const { data: oa } = await client
      .from('alerts')
      .select('id, trip_id, type, subtype, severity, summary, started_at, vehicles(bus_code)')
      .eq('school_id', schoolId)
      .eq('status', 'OPEN')
      .order('started_at', { ascending: false });
    const alerts = (oa ?? []) as unknown as AlertRow[];
    const criticals = alerts.filter((a) => a.severity === 'CRITICAL');

    let anyBroken = false;
    for (const t of trips) {
      try {
        const v = await verifyTripChain(client, t.id);
        if (!v.valid) anyBroken = true;
      } catch {
        /* ignore */
      }
    }

    return (
      <>
        <StatusBar
          segments={[
            { dot: trips.length ? 'info' : 'ok', label: `${trips.length} trips active`, live: trips.length > 0 },
            { dot: criticals.length ? 'critical' : 'ok', label: `${criticals.length} open criticals` },
            { dot: anyBroken ? 'alert' : 'ok', label: `chain: ${anyBroken ? 'TAMPERED' : 'VALID'}` },
          ]}
        />
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
          <Panel
            title="Active trips"
            actions={
              <Link href="/school" className="inline-flex items-center gap-1 text-11 text-ink-400 hover:text-ink-200 transition-colors">
                <RefreshCw size={12} aria-hidden /> Refresh
              </Link>
            }
          >
            {trips.length === 0 ? (
              <EmptyState icon={<Bus size={28} strokeWidth={1.5} />} title="No active trips">
                Buses appear here only while a driver has an open trip. There is nothing to see between
                trips — by design.
              </EmptyState>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {trips.map((t, i) => (
                  <Link
                    key={t.id}
                    href={`/school/trip/${t.id}`}
                    className="alert-in group rounded-ops border border-ink-700 bg-ink-950/40 p-3 transition-colors duration-120 hover:border-ink-500"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-14 font-medium text-ink-100">{t.vehicles?.bus_code ?? 'Bus'}</span>
                      <span className="flex items-center gap-1">
                        {replaySet.has(t.id) && <Chip variant="replay">REPLAY</Chip>}
                        <Chip variant="info">ACTIVE</Chip>
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-12 text-ink-400">
                        {t.routes?.name} · {t.direction}
                      </span>
                      <ArrowRight size={14} strokeWidth={1.5} className="text-ink-600 transition-colors group-hover:text-ink-300" aria-hidden />
                    </div>
                    <div className="tnum mt-1 text-11 text-ink-500">since {fmtTime(t.started_at)}</div>
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="Open critical alerts"
            actions={
              <Link href="/school/alerts" className="text-11 text-ink-400 hover:text-ink-200 transition-colors">
                Triage →
              </Link>
            }
            accent="border-l-sig-critical"
          >
            {criticals.length === 0 ? (
              <EmptyState icon={<AlertOctagon size={28} strokeWidth={1.5} />} title="No open criticals">
                A quiet board is a compliant fleet. Colour appears here only when something is wrong.
              </EmptyState>
            ) : (
              <ul className="space-y-2">
                {criticals.map((a, i) => (
                  <li
                    key={a.id}
                    className="alert-in rounded-ops border border-sig-critical/40 bg-sig-critical/[0.05] p-2"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <div className="flex items-center justify-between">
                      <Chip variant="critical">
                        {a.type}
                        {a.subtype ? `·${a.subtype}` : ''}
                      </Chip>
                      <span className="tnum text-11 text-ink-500">{fmtTime(a.started_at)}</span>
                    </div>
                    <div className="mt-1 text-12 text-ink-200">{a.summary}</div>
                    <div className="mt-1 text-11 text-ink-500">
                      {a.vehicles?.bus_code} ·{' '}
                      <Link className="underline hover:text-ink-300" href={`/school/trip/${a.trip_id}`}>
                        open trip
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </>
    );
  } catch {
    return (
      <EmptyState title="Board unavailable">
        Could not load the live board. Confirm the Supabase connection in <code>.env.local</code>.
      </EmptyState>
    );
  }
}

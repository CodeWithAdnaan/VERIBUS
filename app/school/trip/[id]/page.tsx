import Link from 'next/link';
import { lineString, buffer } from '@turf/turf';
import { requireProfile } from '@/lib/server/auth';
import { serviceClient } from '@/lib/supabase/server';
import { getActivePolicy } from '@/lib/server/policy';
import { verifyTripChain } from '@/lib/server/evidence';
import { buildSpeedPoints, overspeedWindows, unmonitoredGaps, traceSegments, type FixRow, type AlertLite } from '@/lib/server/trace';
import { speedPolicyBanner } from '@/lib/engine/policy';
import { Panel } from '@/components/ui/Panel';
import { Chip, type ChipVariant } from '@/components/ui/Chip';
import { Hash } from '@/components/ui/Hash';
import { EmptyState } from '@/components/ui/EmptyState';
import { SpeedTimeStrip } from '@/components/charts/SpeedTimeStrip';
import { EvidenceChain } from '@/components/charts/EvidenceChain';
import { MapView } from '@/components/map/MapView';
import type { LatLng, MapStop, TraceSegment } from '@/components/map/MapCanvas';
import { fmtTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

const sevChip = (s: string): ChipVariant => (s === 'CRITICAL' ? 'critical' : s === 'WARN' ? 'watch' : 'info');
const confChip = (c: string): ChipVariant => (c === 'HIGH' ? 'ok' : c === 'MEDIUM' ? 'watch' : 'neutral');

export default async function TripDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile(['school_admin']);

  try {
    const client = serviceClient();
    const { data: trip } = await client
      .from('trips')
      .select('id, school_id, route_id, direction, status, distance_m, monitored_seconds, gap_seconds, policy_version, vehicles(bus_code, registration_no), routes(name, polyline, corridor_m)')
      .eq('id', id)
      .single();
    if (!trip || trip.school_id !== profile.school_id) {
      return <EmptyState title="Trip not found for this school." />;
    }

    const [{ data: tele }, { data: al }, { data: ev }, active] = await Promise.all([
      client.from('telemetry').select('device_ts, lat, lng, speed_mps, accuracy_m, quality, source').eq('trip_id', id).order('device_ts', { ascending: true }),
      client.from('alerts').select('type, subtype, severity, confidence, started_at, ended_at, summary, metrics, evidence_id').eq('trip_id', id).order('started_at', { ascending: true }),
      client.from('evidence_records').select('id, seq, kind, record_hash, created_at').eq('trip_id', id).order('seq', { ascending: true }),
      getActivePolicy(client),
    ]);

    const fixes = (tele ?? []) as unknown as (FixRow & { source: string })[];
    const alerts = (al ?? []) as unknown as (AlertLite & { severity: string; confidence: string; summary: string; evidence_id: string | null })[];
    const evidence = (ev ?? []) as { id: string; seq: number; kind: string; record_hash: string; created_at: string }[];
    const evByHashId = new Map(evidence.map((e) => [e.id, e.record_hash]));

    const verdict = await verifyTripChain(client, id).catch(() => null);
    const isReplay = fixes.some((f) => f.source === 'REPLAY');
    const rules = active.rules;
    const banner = speedPolicyBanner(rules);
    const limit = rules.speed.default_limit_kmh;

    // Map data
    const veh = trip.vehicles as unknown as { bus_code: string; registration_no: string } | null;
    const route = trip.routes as unknown as { name: string; polyline: { coordinates: [number, number][] }; corridor_m: number } | null;
    const routeLL: LatLng[] = (route?.polyline?.coordinates ?? []).map((c) => [c[1], c[0]]);
    let corridor: LatLng[] | undefined;
    try {
      if (route && route.polyline.coordinates.length > 1) {
        const buffered = buffer(lineString(route.polyline.coordinates), route.corridor_m / 1000, { units: 'kilometers' });
        const g = buffered?.geometry;
        if (g && g.type === 'Polygon') corridor = (g.coordinates[0] as [number, number][]).map((c) => [c[1], c[0]]);
      }
    } catch {
      corridor = undefined;
    }
    const segments = traceSegments(fixes, alerts) as TraceSegment[];
    const { data: stopsRaw } = await client.from('stops').select('seq, name, lat, lng').eq('route_id', trip.route_id).order('seq', { ascending: true });
    const stops = (stopsRaw ?? []) as MapStop[];
    const goodish = fixes.filter((f) => f.quality === 'GOOD' || f.quality === 'DEGRADED');
    const lastFix = goodish[goodish.length - 1];
    const bus = lastFix ? { lat: lastFix.lat, lng: lastFix.lng, ageSec: (Date.now() - Date.parse(lastFix.device_ts)) / 1000 } : null;

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/school" className="text-12 text-ink-400">← Board</Link>
          <span className="text-16 font-semibold text-ink-100">{veh?.bus_code}</span>
          <Chip variant="neutral">{route?.name} · {trip.direction}</Chip>
          <Chip variant={trip.status === 'ACTIVE' ? 'info' : 'neutral'}>{trip.status}</Chip>
          {isReplay && <Chip variant="replay">REPLAY</Chip>}
          {verdict && <Chip variant={verdict.valid ? 'ok' : 'alert'}>chain {verdict.valid ? 'VALID' : 'TAMPERED'}</Chip>}
          <span className="tnum ml-auto text-11 text-ink-500">
            {Math.round((trip.distance_m ?? 0))} m · monitored {trip.monitored_seconds ?? 0}s · gap {trip.gap_seconds ?? 0}s · policy {trip.policy_version ?? '—'}
          </span>
        </div>

        <Panel title="Route & trace" bodyClassName="p-0">
          <MapView basemap="dark" route={routeLL} corridor={corridor} segments={segments} stops={stops} bus={bus} height={380} />
        </Panel>

        <Panel title="★ Speed vs time · signal quality" subtitle={banner.message}>
          {banner.level === 'disabled' ? (
            <div className="rounded-ops border border-sig-watch/40 bg-sig-watch/[0.06] p-3 text-13 text-sig-watch">
              {banner.message}
            </div>
          ) : (
            <SpeedTimeStrip
              points={buildSpeedPoints(fixes)}
              limitKmh={limit}
              toleranceKmh={rules.speed.tolerance_kmh}
              windows={overspeedWindows(alerts)}
              gaps={unmonitoredGaps(alerts)}
              height={220}
            />
          )}
        </Panel>

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Panel title="Alerts">
            {alerts.length === 0 ? (
              <EmptyState title="No alerts on this trip">A clean trip produces no colour. That is the point.</EmptyState>
            ) : (
              <ul className="space-y-2">
                {alerts.map((a, i) => (
                  <li key={i} className="rounded-ops border border-ink-700 bg-ink-950/40 p-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-13 font-medium text-ink-100">{a.type}{a.subtype ? ` · ${a.subtype}` : ''}</span>
                      <Chip variant={sevChip(a.severity)}>{a.severity}</Chip>
                      <Chip variant={confChip(a.confidence)}>{a.confidence}</Chip>
                      <span className="tnum ml-auto text-11 text-ink-500">{fmtTime(a.started_at)}</span>
                    </div>
                    <div className="mt-1 text-12 text-ink-300">{a.summary}</div>
                    {a.evidence_id && (
                      <div className="mt-1 text-11 text-ink-500">evidence <Hash value={evByHashId.get(a.evidence_id)} /></div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Evidence chain" subtitle={verdict ? `${verdict.record_count} records` : undefined}>
            {evidence.length === 0 ? (
              <EmptyState title="No evidence yet" />
            ) : (
              <EvidenceChain records={evidence} brokenAtSeq={verdict?.broken_at_seq ?? null} />
            )}
          </Panel>
        </div>
      </div>
    );
  } catch {
    return <EmptyState title="Trip unavailable">Could not load this trip. Confirm the Supabase connection.</EmptyState>;
  }
}

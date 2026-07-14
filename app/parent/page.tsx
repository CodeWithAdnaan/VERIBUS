// Parent live view — THE PRIVACY HEADLINE (BUILD SPEC §7, §13, §15).
// The database, not the UI, decides what a parent may see: we read the active trip
// and its telemetry through the USER-SCOPED sessionClient() so RLS is the enforcer.
// RLS returns ONLY the parent's active, assigned, consented trip — and only the last
// ~3 minutes of fixes. There is deliberately nothing to see between trips.
import Link from 'next/link';
import { Bus, EyeOff, ShieldCheck, MessageSquareWarning } from 'lucide-react';
import { requireProfile } from '@/lib/server/auth';
import { sessionClient } from '@/lib/supabase/session';
import { serviceClient } from '@/lib/supabase/server';
import { PublicShell } from '@/components/shell/PublicShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { Chip } from '@/components/ui/Chip';
import { PilotGap } from '@/components/ui/PilotGap';
import type { BusMarker, LatLng, MapStop } from '@/components/map/MapCanvas';
import { LiveTail, type TailResult } from './LiveTail';

export const dynamic = 'force-dynamic';

interface FixRow {
  lat: number;
  lng: number;
  heading: number | null;
  device_ts: string;
  quality: 'GOOD' | 'DEGRADED' | 'REJECTED';
  source: string;
}

// ── build the live tail + last fix from a set of RLS-scoped telemetry rows ──
function buildTail(fixes: FixRow[]): { tail: LatLng[]; bus: BusMarker | null; busTs: number | null } {
  const usable = fixes
    .filter((f) => f.quality !== 'REJECTED')
    .sort((a, b) => Date.parse(a.device_ts) - Date.parse(b.device_ts));
  const tail: LatLng[] = usable.map((f) => [f.lat, f.lng]);
  const last = usable[usable.length - 1];
  if (!last) return { tail, bus: null, busTs: null };
  const busTs = Date.parse(last.device_ts);
  return {
    tail,
    bus: { lat: last.lat, lng: last.lng, heading: last.heading, ageSec: Math.max(0, (Date.now() - busTs) / 1000) },
    busTs,
  };
}

// ── SERVER ACTION: re-read the tail for the 10s poll. Re-checks the trip through RLS,
// so if consent is withdrawn (or the trip ends) mid-view, the live view LOCKS. ──
async function refreshTail(tripId: string): Promise<TailResult> {
  'use server';
  try {
    const supa = await sessionClient();
    // RLS: returns the row only while this parent may still see this ACTIVE trip.
    const { data: trips } = await supa.from('trips').select('id').eq('id', tripId).eq('status', 'ACTIVE').limit(1);
    if (!trips || trips.length === 0) return { ok: true, ended: true, bus: null, busTs: null, tail: [] };
    // RLS caps this to the last ~3 minutes — we add no time filter of our own.
    const { data } = await supa
      .from('telemetry')
      .select('lat,lng,heading,device_ts,quality,source')
      .eq('trip_id', tripId);
    const { tail, bus, busTs } = buildTail((data ?? []) as FixRow[]);
    return { ok: true, ended: false, bus, busTs, tail };
  } catch {
    // Transient failure — tell the client to keep the last known position, never crash.
    return { ok: false, ended: false, bus: null, busTs: null, tail: [] };
  }
}

export default async function ParentLivePage() {
  await requireProfile(['parent']);

  let trip: { id: string; route_id: string; vehicle_id: string } | null = null;
  let fixes: FixRow[] = [];
  let busCode = '';
  let routeName = '';
  let routeLine: LatLng[] = [];
  let stops: MapStop[] = [];

  try {
    const supa = await sessionClient();
    // PRIVACY GATE: RLS returns ONLY this parent's active + consented trip (if any).
    const { data: trips } = await supa
      .from('trips')
      .select('id, route_id, vehicle_id')
      .eq('status', 'ACTIVE')
      .order('started_at', { ascending: false })
      .limit(1);
    trip = (trips?.[0] as { id: string; route_id: string; vehicle_id: string } | undefined) ?? null;

    if (trip) {
      // Live tail via RLS (last ~3 minutes only).
      const { data } = await supa
        .from('telemetry')
        .select('lat,lng,heading,device_ts,quality,source')
        .eq('trip_id', trip.id);
      fixes = (data ?? []) as FixRow[];

      // Context labels + map geometry. RLS has already authorised this trip for this
      // parent; the route line, stops and bus label are non-sensitive map context.
      const svc = serviceClient();
      const [{ data: vehicle }, { data: route }, { data: stopRows }] = await Promise.all([
        svc.from('vehicles').select('bus_code').eq('id', trip.vehicle_id).maybeSingle(),
        svc.from('routes').select('name, polyline').eq('id', trip.route_id).maybeSingle(),
        svc.from('stops').select('seq,name,lat,lng').eq('route_id', trip.route_id).order('seq'),
      ]);
      busCode = (vehicle?.bus_code as string) ?? '';
      routeName = (route?.name as string) ?? '';
      const coords = (route?.polyline?.coordinates ?? []) as [number, number][];
      routeLine = coords.map((c) => [c[1], c[0]] as LatLng); // GeoJSON [lng,lat] → [lat,lng]
      stops = ((stopRows ?? []) as { seq: number; name: string; lat: number; lng: number }[]).map((s) => ({
        seq: s.seq,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
      }));
    }
  } catch {
    // Never crash the privacy headline — fall through to the empty state.
    trip = null;
  }

  const isReplay = fixes.some((f) => f.source === 'REPLAY');
  const { tail, bus, busTs } = buildTail(fixes);

  return (
    <PublicShell title="Live view">
      {!trip ? (
        // Designed empty state — the map is DARK and LOCKED. This is the whole point.
        <div className="overflow-hidden rounded-counter border border-ink-700 bg-ink-950">
          <EmptyState icon={<EyeOff size={28} strokeWidth={1.5} />} title="No active trip right now.">
            Your child&rsquo;s bus appears here only while it is on a live trip — there is nothing to
            see between trips, by design.
          </EmptyState>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-counter border border-black/10 bg-paper-2 px-3 py-2">
            <div className="flex items-center gap-2 text-ink-900">
              <Bus size={18} strokeWidth={1.75} className="text-sig-info" aria-hidden />
              <span className="tnum text-14 font-semibold">{busCode || 'Bus'}</span>
              {routeName && <span className="text-13 text-ink-600">· {routeName}</span>}
            </div>
            {isReplay && <Chip variant="replay">REPLAY</Chip>}
          </div>

          <LiveTail
            tripId={trip.id}
            route={routeLine}
            stops={stops}
            initialBus={bus}
            initialBusTs={busTs}
            initialTail={tail}
            refresh={refreshTail}
          />

          <p className="flex items-start gap-1.5 text-12 leading-relaxed text-ink-600">
            <ShieldCheck size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-sig-info" aria-hidden />
            Live tail only — no history, no other buses (enforced in the database). When the trip
            ends, this view locks.
          </p>

          <PilotGap id="background-gps" />
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2 border-t border-black/10 pt-4">
        <Link
          href="/parent/consent"
          className="flex items-center justify-between rounded-counter border border-black/10 bg-paper-2 px-3 py-2.5 text-14 text-ink-900 hover:bg-paper"
        >
          <span className="flex items-center gap-2">
            <ShieldCheck size={16} strokeWidth={1.75} className="text-sig-info" aria-hidden />
            Consent &amp; privacy
          </span>
          <span className="text-12 text-ink-600">Grant or withdraw</span>
        </Link>
        <Link
          href="/parent/complaint"
          className="flex items-center justify-between rounded-counter border border-black/10 bg-paper-2 px-3 py-2.5 text-14 text-ink-900 hover:bg-paper"
        >
          <span className="flex items-center gap-2">
            <MessageSquareWarning size={16} strokeWidth={1.75} className="text-sig-info" aria-hidden />
            Raise a complaint
          </span>
          <span className="text-12 text-ink-600">Safety concern</span>
        </Link>
      </div>
    </PublicShell>
  );
}

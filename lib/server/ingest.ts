// ============================================================================
// INGESTION (BUILD SPEC §4) — the server is the source of truth for time.
//   classify signal quality → idempotent insert → re-evaluate → reconcile alerts
//   → append evidence for NEW alerts → update trip aggregates.
// Runs with the service-role client (RLS is for reads). Same code path for
// DEVICE and REPLAY telemetry — the replay harness is not a mock.
// ============================================================================
import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceClient } from '@/lib/supabase/server';
import { classifyFix } from '@/lib/engine/signal';
import { evaluate } from '@/lib/engine/alerts';
import { metresBetween } from '@/lib/engine/geo';
import { getActivePolicy } from './policy';
import { appendEvidence } from './evidence';
import type {
  AlertEvent, Fix, Heartbeat, RouteGeom, Stop, TripContext,
} from '@/lib/engine/types';
import type { FixInput } from '@/lib/zod/schemas';

const nowIso = (): string => new Date().toISOString();
const toMs = (s: string): number => Date.parse(s);

export interface IngestResult {
  inserted: number;
  total_fixes: number;
  alerts: number;
  new_alerts: number;
  chain_head: string | null;
}

interface TripRow {
  id: string;
  route_id: string;
  vehicle_id: string;
  school_id: string;
  driver_id: string | null;
  direction: 'PICKUP' | 'DROP';
  status: string;
  started_at: string | null;
  ended_at: string | null;
  planned_start: string | null;
  planned_end: string | null;
  chain_head: string | null;
}

function toTripContext(t: TripRow): TripContext {
  return {
    id: t.id, route_id: t.route_id, vehicle_id: t.vehicle_id, school_id: t.school_id,
    driver_id: t.driver_id, direction: t.direction, status: t.status,
    started_at: t.started_at, ended_at: t.ended_at,
    planned_start: t.planned_start, planned_end: t.planned_end,
  };
}

async function loadFixes(client: SupabaseClient, tripId: string): Promise<Fix[]> {
  const { data } = await client
    .from('telemetry')
    .select('seq, device_ts, server_ts, lat, lng, speed_mps, heading, accuracy_m, app_state, buffered, quality, source')
    .eq('trip_id', tripId)
    .order('device_ts', { ascending: true });
  return (data ?? []) as Fix[];
}

async function loadHeartbeats(client: SupabaseClient, tripId: string): Promise<Heartbeat[]> {
  const { data } = await client
    .from('heartbeats')
    .select('server_ts, app_state, gps_permission, has_fix, battery_pct')
    .eq('trip_id', tripId)
    .order('server_ts', { ascending: true });
  return (data ?? []) as Heartbeat[];
}

async function loadRouteAndStops(
  client: SupabaseClient,
  routeId: string
): Promise<{ route: RouteGeom; stops: Stop[] }> {
  const { data: r } = await client
    .from('routes')
    .select('id, polyline, corridor_m, direction')
    .eq('id', routeId)
    .single();
  const { data: s } = await client
    .from('stops')
    .select('id, seq, name, lat, lng, scheduled_offset_min, dwell_allowance_sec')
    .eq('route_id', routeId)
    .order('seq', { ascending: true });
  if (!r) throw new Error(`route ${routeId} not found`);
  return {
    route: { id: r.id, polyline: r.polyline, corridor_m: r.corridor_m, direction: r.direction },
    stops: (s ?? []) as Stop[],
  };
}

async function reconcileAlerts(
  client: SupabaseClient,
  trip: TripRow,
  events: AlertEvent[],
  _now: string
): Promise<number> {
  const { data: existing } = await client
    .from('alerts')
    .select('id, identity_key')
    .eq('trip_id', trip.id);
  const byKey = new Map((existing ?? []).map((a) => [a.identity_key as string, a]));
  let newCount = 0;

  for (const ev of events) {
    const hit = byKey.get(ev.identity_key);
    if (hit) {
      // Update the mutable window fields; never disturb status/ack/resolution.
      await client
        .from('alerts')
        .update({
          subtype: ev.subtype ?? null,
          severity: ev.severity,
          confidence: ev.confidence,
          ended_at: ev.ended_at ?? null,
          summary: ev.summary,
          metrics: ev.metrics,
        })
        .eq('id', hit.id);
    } else {
      // New alert → append an evidence record first, then insert the alert.
      const kind = ev.type === 'SOS' ? 'SOS' : 'ALERT';
      const evidence = await appendEvidence(client, trip.id, kind, {
        alert_type: ev.type,
        event_class: ev.event_class,
        subtype: ev.subtype ?? null,
        severity: ev.severity,
        confidence: ev.confidence,
        started_at: ev.started_at,
        ended_at: ev.ended_at ?? null,
        summary: ev.summary,
        metrics: ev.metrics,
        identity_key: ev.identity_key,
      });
      await client.from('alerts').insert({
        evidence_id: evidence.id,
        trip_id: trip.id,
        school_id: trip.school_id,
        vehicle_id: trip.vehicle_id,
        driver_id: trip.driver_id,
        type: ev.type,
        subtype: ev.subtype ?? null,
        severity: ev.severity,
        confidence: ev.confidence,
        status: 'OPEN',
        started_at: ev.started_at,
        ended_at: ev.ended_at ?? null,
        summary: ev.summary,
        metrics: ev.metrics,
        identity_key: ev.identity_key,
      });
      newCount++;
    }
  }
  return newCount;
}

async function updateAggregates(
  client: SupabaseClient,
  trip: TripRow,
  fixes: Fix[],
  events: AlertEvent[]
): Promise<string | null> {
  const good = fixes
    .filter((f) => f.quality === 'GOOD')
    .sort((a, b) => toMs(a.device_ts) - toMs(b.device_ts));

  let dist = 0;
  for (let i = 1; i < good.length; i++) {
    dist += metresBetween(good[i - 1]!.lat, good[i - 1]!.lng, good[i]!.lat, good[i]!.lng);
  }
  const monitored =
    good.length > 1
      ? (toMs(good[good.length - 1]!.device_ts) - toMs(good[0]!.device_ts)) / 1000
      : 0;
  const gap = events
    .filter((e) => e.type === 'SIGNAL_LOST')
    .reduce((a, e) => a + (Number(e.metrics.gap_seconds) || 0), 0);

  const { data } = await client
    .from('trips')
    .update({
      distance_m: Math.round(dist),
      monitored_seconds: Math.round(monitored),
      gap_seconds: Math.round(gap),
    })
    .eq('id', trip.id)
    .select('chain_head')
    .single();
  return data?.chain_head ?? null;
}

const TRIP_COLS =
  'id, route_id, vehicle_id, school_id, driver_id, direction, status, started_at, ended_at, planned_start, planned_end, chain_head';

/** Reload trip context, re-run the engine, reconcile alerts, update aggregates. */
async function runEvaluation(client: SupabaseClient, trip: TripRow): Promise<IngestResult> {
  const now = nowIso();
  const { rules: policy } = await getActivePolicy(client);

  const fixes = await loadFixes(client, trip.id);
  const heartbeats = await loadHeartbeats(client, trip.id);
  const { route, stops } = await loadRouteAndStops(client, trip.route_id);

  const { alerts: events } = evaluate({
    trip: toTripContext(trip),
    fixes,
    heartbeats,
    route,
    stops,
    policy,
    now,
  });

  const newCount = await reconcileAlerts(client, trip, events, now);
  const chainHead = await updateAggregates(client, trip, fixes, events);

  return {
    inserted: 0,
    total_fixes: fixes.length,
    alerts: events.length,
    new_alerts: newCount,
    chain_head: chainHead,
  };
}

export async function ingestBatch(params: {
  trip_id: string;
  fixes: FixInput[];
  source: 'DEVICE' | 'REPLAY';
}): Promise<IngestResult> {
  const client = serviceClient();
  const now = nowIso();

  const { data: tripRow, error: te } = await client
    .from('trips')
    .select(TRIP_COLS)
    .eq('id', params.trip_id)
    .single();
  if (te || !tripRow) {
    throw Object.assign(new Error('Trip not found'), { status: 404 });
  }
  const trip = tripRow as TripRow;
  const { rules: policy } = await getActivePolicy(client);

  const rows = params.fixes.map((f) => ({
    trip_id: params.trip_id,
    seq: f.seq,
    device_ts: f.device_ts,
    server_ts: now,
    lat: f.lat,
    lng: f.lng,
    speed_mps: f.speed_mps,
    heading: f.heading ?? null,
    accuracy_m: f.accuracy_m,
    app_state: f.app_state,
    buffered: f.buffered ?? false,
    quality: classifyFix({ accuracy_m: f.accuracy_m, speed_mps: f.speed_mps }, policy),
    source: params.source,
  }));

  const { error: ie } = await client
    .from('telemetry')
    .upsert(rows, { onConflict: 'trip_id,seq', ignoreDuplicates: true });
  if (ie) throw new Error(`telemetry insert failed: ${ie.message}`);

  const result = await runEvaluation(client, trip);
  return { ...result, inserted: rows.length };
}

/** Re-run the engine for a trip without new telemetry (heartbeat, trip-end, watchdog). */
export async function reevaluateTrip(tripId: string): Promise<IngestResult> {
  const client = serviceClient();
  const { data: tripRow, error } = await client
    .from('trips')
    .select(TRIP_COLS)
    .eq('id', tripId)
    .single();
  if (error || !tripRow) throw Object.assign(new Error('Trip not found'), { status: 404 });
  return runEvaluation(client, tripRow as TripRow);
}

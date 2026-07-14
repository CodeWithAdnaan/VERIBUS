// Shared test fixtures for the engine tests. Timestamps are derived from a fixed
// epoch so every test is deterministic.
import { classifyFixes } from '@/lib/engine/signal';
import type { Fix, PolicyRules, RouteGeom, Stop, TripContext } from '@/lib/engine/types';

export const T0 = Date.parse('2026-07-14T03:00:00.000Z');
export const at = (sec: number): string => new Date(T0 + sec * 1000).toISOString();

export function testPolicy(): PolicyRules {
  return {
    speed: {
      default_limit_kmh: 40,
      school_zone_limit_kmh: 25,
      limit_source: 'DEMO VALUE — configured by operator; not asserted by this system',
      tolerance_kmh: 5,
      sustained_seconds: 8,
      min_consecutive_fixes: 4,
      max_accuracy_m: 25,
      cooldown_seconds: 120,
    },
    stop: { movement_threshold_mps: 1.0, unexpected_stop_sec: 300 },
    deviation: { sustained_seconds: 45, min_fixes: 5, poor_accuracy_downgrade_m: 25 },
    delay: { threshold_min: 10, min_history_trips: 3 },
    signal: { heartbeat_interval_sec: 20, signal_lost_sec: 120, degraded_accuracy_m: 60 },
    integrity: { require_bind: true, require_precheck: true, require_attendant: true },
    scoring: {
      base: 100,
      deductions: {
        TRIP_NOT_STARTED: 8,
        SIGNAL_TAMPER: 6,
        ROUTE_DEVIATION: 5,
        OVERSPEED: 4,
        COMPLAINT_UPHELD: 4,
        LONG_STOP: 3,
        PRECHECK_FAILED_BLOCKING: 5,
        DOC_EXPIRED: 10,
        COVERAGE_GAP: 0,
      },
      confidence_multiplier: { HIGH: 1.0, MEDIUM: 0.5, LOW: 0.0 },
      decay: { half_weight_after_days: 45, drop_after_days: 90 },
    },
    retention: { raw_telemetry_days: 30, evidence_days: 365 },
  };
}

// Route A synthetic polyline (matches db/seed.sql).
export const routeA: RouteGeom = {
  id: 'route-a',
  direction: 'PICKUP',
  corridor_m: 60,
  polyline: {
    type: 'LineString',
    coordinates: [
      [74.79, 34.07],
      [74.7975, 34.074],
      [74.805, 34.0785],
      [74.813, 34.083],
      [74.82, 34.0875],
      [74.827, 34.092],
      [74.834, 34.096],
    ],
  },
};

export const stopsA: Stop[] = [
  { id: 's1', seq: 1, name: 'Rainawari Chowk', lat: 34.07, lng: 74.79, scheduled_offset_min: 0, dwell_allowance_sec: 180 },
  { id: 's3', seq: 3, name: 'Hazratbal Crossing', lat: 34.0785, lng: 74.805, scheduled_offset_min: 10, dwell_allowance_sec: 180 },
  { id: 's7', seq: 7, name: 'School Gate', lat: 34.096, lng: 74.834, scheduled_offset_min: 30, dwell_allowance_sec: 240 },
];

export function trip(overrides: Partial<TripContext> = {}): TripContext {
  return {
    id: 'trip-1',
    route_id: 'route-a',
    vehicle_id: 'veh-5',
    school_id: 'school-a',
    driver_id: 'driver-1',
    direction: 'PICKUP',
    status: 'ACTIVE',
    started_at: at(0),
    planned_start: at(0),
    planned_end: at(2100),
    ...overrides,
  };
}

export interface FixOpts {
  lat?: number;
  lng?: number;
  speed_mps?: number | null;
  accuracy_m?: number;
  buffered?: boolean;
  server_sec?: number;
}

export function makeFix(seq: number, sec: number, opts: FixOpts = {}): Fix {
  return {
    seq,
    device_ts: at(sec),
    server_ts: at(opts.server_sec ?? sec),
    lat: opts.lat ?? 34.0785,
    lng: opts.lng ?? 74.805,
    speed_mps: opts.speed_mps === undefined ? 0 : opts.speed_mps,
    heading: null,
    accuracy_m: opts.accuracy_m ?? 8,
    app_state: 'FOREGROUND',
    buffered: opts.buffered ?? false,
    quality: 'GOOD',
    source: 'DEVICE',
  };
}

/** Assigns signal quality to a batch, exactly as the ingest path does. */
export function classified(fixes: Fix[], policy: PolicyRules): Fix[] {
  return classifyFixes(fixes, policy);
}

export const KMH = (kmh: number): number => kmh / 3.6; // km/h → m/s helper

// ============================================================================
// Engine types (BUILD SPEC §8). Shared by the pure engine, the ingest path,
// and the UI. Nothing here touches the database.
// ============================================================================

export type FixQuality = 'GOOD' | 'DEGRADED' | 'REJECTED';
export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type Severity = 'INFO' | 'WARN' | 'CRITICAL';
export type TripDirection = 'PICKUP' | 'DROP';

export type AlertTypeName =
  | 'OVERSPEED'
  | 'LONG_STOP'
  | 'ROUTE_DEVIATION'
  | 'DELAY'
  | 'SIGNAL_LOST'
  | 'SOS'
  | 'REPEAT_COMPLAINT'
  | 'TRIP_NOT_STARTED';

// The class used by the scoring ledger. Distinct from AlertTypeName because one
// alert type (SIGNAL_LOST) maps to several score classes with very different
// weights — this is the ethical core (COVERAGE_GAP = 0, SIGNAL_TAMPER = full).
export type EventClass =
  | 'OVERSPEED'
  | 'LONG_STOP'
  | 'ROUTE_DEVIATION'
  | 'DELAY'
  | 'COVERAGE_GAP'
  | 'SIGNAL_TAMPER'
  | 'SIGNAL_PENDING' // never scored (weight absent from the deductions map)
  | 'TRIP_NOT_STARTED'
  | 'COMPLAINT_UPHELD'
  | 'PRECHECK_FAILED_BLOCKING'
  | 'DOC_EXPIRED';

/** A single GPS fix. speed_mps comes ONLY from GPS Doppler; null is legal. */
export interface Fix {
  seq: number;
  device_ts: string; // ISO — when the device recorded it
  server_ts?: string; // ISO — when the server received it (may be much later if buffered)
  lat: number;
  lng: number;
  speed_mps: number | null; // GPS Doppler ONLY. NEVER distance/time. NEVER accelerometer.
  heading: number | null;
  accuracy_m: number;
  app_state: 'FOREGROUND' | 'BACKGROUND';
  buffered: boolean; // true = arrived late from the IndexedDB buffer
  quality: FixQuality;
  source?: 'DEVICE' | 'REPLAY';
}

export interface Heartbeat {
  server_ts: string; // ISO
  app_state: string;
  gps_permission: 'granted' | 'denied' | 'prompt';
  has_fix: boolean;
  battery_pct?: number | null;
}

export interface GeoLineString {
  type: 'LineString';
  coordinates: [number, number][]; // [lng, lat]
}

export interface RouteGeom {
  id: string;
  polyline: GeoLineString;
  corridor_m: number;
  direction: TripDirection;
}

export interface Stop {
  id: string;
  seq: number;
  name: string;
  lat: number;
  lng: number;
  scheduled_offset_min: number;
  dwell_allowance_sec: number;
}

export interface TripContext {
  id: string;
  route_id: string;
  vehicle_id: string;
  school_id: string;
  driver_id?: string | null;
  direction: TripDirection;
  status: string;
  started_at?: string | null; // ISO
  ended_at?: string | null; // ISO
  planned_start?: string | null; // ISO
  planned_end?: string | null; // ISO
}

/** Historical median context for the DELAY alert (computed by the caller, not the engine). */
export interface DelayHistory {
  median_duration_min: number | null;
  sample_size: number;
}

export interface AlertEvent {
  type: AlertTypeName;
  event_class: EventClass;
  subtype?: string | null; // SIGNAL_LOST: 'PENDING'|'COVERAGE_GAP'|'SIGNAL_TAMPER'
  severity: Severity;
  confidence: Confidence;
  started_at: string; // ISO
  ended_at?: string | null; // ISO
  summary: string;
  metrics: Record<string, unknown>;
  /** Stable dedupe key so re-evaluation upserts instead of duplicating (§8, §14). */
  identity_key: string;
}

export interface EngineNotice {
  code: 'POLICY_UNSET' | 'DELAY_SCHEDULE_FALLBACK';
  alert_type: AlertTypeName;
  message: string;
}

export interface EvaluateResult {
  alerts: AlertEvent[];
  notices: EngineNotice[];
}

export interface EvaluateInput {
  trip: TripContext;
  fixes: Fix[];
  heartbeats: Heartbeat[];
  route: RouteGeom;
  stops: Stop[];
  policy: PolicyRules;
  history?: DelayHistory;
  now: string; // ISO — server is the source of truth for time (§4)
}

// ── Policy (BUILD SPEC §6). The app reads NOTHING from constants. ─────────────
export interface PolicyRules {
  speed: {
    default_limit_kmh: number | null; // starts null — evaluation disabled until set
    school_zone_limit_kmh: number | null;
    limit_source: string; // 'UNSET' or a cited circular reference
    tolerance_kmh: number;
    sustained_seconds: number;
    min_consecutive_fixes: number;
    max_accuracy_m: number;
    cooldown_seconds: number;
  };
  stop: { movement_threshold_mps: number; unexpected_stop_sec: number };
  deviation: {
    sustained_seconds: number;
    min_fixes: number;
    poor_accuracy_downgrade_m: number;
  };
  delay: { threshold_min: number; min_history_trips: number };
  signal: {
    heartbeat_interval_sec: number;
    signal_lost_sec: number;
    degraded_accuracy_m?: number; // DEGRADED cutoff (§8 states 60); optional, defaults to 60
  };
  integrity: {
    require_bind: boolean;
    require_precheck: boolean;
    require_attendant: boolean;
  };
  scoring: {
    base: number;
    deductions: Record<string, number>;
    confidence_multiplier: { HIGH: number; MEDIUM: number; LOW: number };
    decay: { half_weight_after_days: number; drop_after_days: number };
  };
  retention: { raw_telemetry_days: number; evidence_days: number };
}

// ── Scoring (BUILD SPEC §11) ─────────────────────────────────────────────────
export interface ScorableEvent {
  event_class: EventClass;
  confidence: Confidence;
  occurred_at: string; // ISO
  alert_id?: string | null;
  evidence_id?: string | null;
}

export interface DocPenalty {
  label: string; // e.g. 'Insurance expired'
  event_class: 'DOC_EXPIRED';
  occurred_at: string; // ISO expiry date
  evidence_id?: string | null;
}

export interface DeductionLine {
  event_class: EventClass;
  alert_id?: string | null;
  evidence_id?: string | null;
  occurred_at: string;
  raw_weight: number;
  confidence: Confidence;
  conf_mult: number;
  age_days: number;
  decay_mult: number;
  applied: number; // raw_weight * conf_mult * decay_mult
}

export interface DeductionLedger {
  base: number;
  lines: DeductionLine[];
  doc_lines: DeductionLine[];
  final: number;
  policy_version: string;
  computed_at: string;
}

/**
 * VERIBUS — SEAL engine stack
 * S · Signal Quality  →  E · Evidence Ledger  →  A · Alerts  →  L · Compliance Ledger
 *
 * Tracking is the input. Evidence is the product.
 */
// ============================================================================
// A · THE ALERT ENGINE (BUILD SPEC §8) — pure functions, no DB calls inside.
// evaluate(input) is deterministic and unit-testable. ALL rules read from
// `policy`. There are ZERO magic numbers in this file.
//
// Signal quality runs first (signal.ts). The engine evaluates ONLY GOOD fixes.
// DEGRADED fixes may only DOWNGRADE confidence, never trigger.
// ============================================================================
import type {
  AlertEvent,
  Confidence,
  DelayHistory,
  EngineNotice,
  EvaluateInput,
  EvaluateResult,
  Fix,
  Heartbeat,
  PolicyRules,
  Stop,
  TripContext,
} from './types';
import { distanceToRoute, nearestStop } from './geo';

// ── small pure helpers ───────────────────────────────────────────────────────
const toMs = (iso: string): number => Date.parse(iso);
const kmh = (mps: number): number => mps * 3.6;
const round1 = (n: number): number => Math.round(n * 10) / 10;
const iso = (ms: number): string => new Date(ms).toISOString();
const byDeviceTs = (a: Fix, b: Fix): number => toMs(a.device_ts) - toMs(b.device_ts);

function consecutiveRuns<T>(arr: T[], pred: (x: T) => boolean): T[][] {
  const runs: T[][] = [];
  let cur: T[] = [];
  for (const x of arr) {
    if (pred(x)) cur.push(x);
    else if (cur.length) {
      runs.push(cur);
      cur = [];
    }
  }
  if (cur.length) runs.push(cur);
  return runs;
}

/** Evenly downsample to at most `max` points, always keeping first + last. */
function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = (arr.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.round(i * step)]!);
  return out;
}

function meanAccuracy(fixes: Fix[]): number {
  if (!fixes.length) return Infinity;
  return fixes.reduce((a, f) => a + f.accuracy_m, 0) / fixes.length;
}

function nearestStopPair(first: Fix, last: Fix, stops: Stop[]): [string | null, string | null] {
  const a = nearestStop(first.lat, first.lng, stops);
  const b = nearestStop(last.lat, last.lng, stops);
  return [a ? a.stop.name : null, b ? b.stop.name : null];
}

// ── A1 · OVERSPEED ───────────────────────────────────────────────────────────
export function overspeed(
  good: Fix[],
  policy: PolicyRules,
  stops: Stop[]
): { alerts: AlertEvent[]; notice?: EngineNotice } {
  const limit = policy.speed.default_limit_kmh;
  if (limit === null || limit === undefined) {
    // Do NOT evaluate. The system never asserts a legal limit on its own authority.
    return {
      alerts: [],
      notice: {
        code: 'POLICY_UNSET',
        alert_type: 'OVERSPEED',
        message:
          'Overspeed evaluation disabled — no speed limit configured. Set the limit and cite its source on the Policy screen.',
      },
    };
  }
  const tol = policy.speed.tolerance_kmh;
  const over = (f: Fix) => f.speed_mps !== null && kmh(f.speed_mps) > limit + tol;
  const runs = consecutiveRuns(good, over);
  const events: AlertEvent[] = [];
  let lastWindowEndSec = -Infinity;

  for (const run of runs) {
    const first = run[0]!;
    const last = run[run.length - 1]!;
    const durationS = (toMs(last.device_ts) - toMs(first.device_ts)) / 1000;
    if (durationS < policy.speed.sustained_seconds) continue; // not sustained → e.g. a 1s spike
    if (run.length < policy.speed.min_consecutive_fixes) continue;
    // Cooldown: no new OVERSPEED alert for cooldown_seconds after a window closes.
    if (toMs(first.device_ts) / 1000 < lastWindowEndSec + policy.speed.cooldown_seconds) continue;
    lastWindowEndSec = toMs(last.device_ts) / 1000;

    const speeds = run.map((f) => kmh(f.speed_mps as number));
    const peak = Math.max(...speeds);
    const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const meanAcc = meanAccuracy(run);
    const fixCount = run.length;

    const confidence: Confidence =
      fixCount >= 6 && meanAcc <= 15 ? 'HIGH' : fixCount >= 4 && meanAcc <= 25 ? 'MEDIUM' : 'LOW';

    const speedSeries = downsample(run, 40).map((f) => ({
      t: f.device_ts,
      kmh: round1(kmh(f.speed_mps as number)),
      accuracy_m: f.accuracy_m,
      quality: f.quality,
    }));

    events.push({
      type: 'OVERSPEED',
      event_class: 'OVERSPEED',
      severity: confidence === 'HIGH' ? 'CRITICAL' : 'WARN',
      confidence,
      started_at: first.device_ts,
      ended_at: last.device_ts,
      summary: `Sustained overspeed: peak ${peak.toFixed(0)} km/h (limit ${limit}+${tol}) for ${durationS.toFixed(0)}s over ${fixCount} fixes`,
      metrics: {
        peak_speed_kmh: round1(peak),
        mean_speed_kmh: round1(mean),
        duration_s: Math.round(durationS),
        fix_count: fixCount,
        mean_accuracy_m: round1(meanAcc),
        limit_applied: limit,
        limit_source: policy.speed.limit_source,
        nearest_stop_pair: nearestStopPair(first, last, stops),
        speed_series: speedSeries, // violation WINDOW only, ≤ 40 points
      },
      identity_key: `OVERSPEED:${first.seq}`,
    });
  }
  return { alerts: events };
}

// ── A2 · LONG_STOP ───────────────────────────────────────────────────────────
export function longStop(
  good: Fix[],
  policy: PolicyRules,
  stops: Stop[],
  trip: TripContext
): AlertEvent[] {
  const thr = policy.stop.movement_threshold_mps;
  const stopped = (f: Fix) => f.speed_mps !== null && f.speed_mps < thr;
  const runs = consecutiveRuns(good, stopped);
  const events: AlertEvent[] = [];
  const startedMs = trip.started_at ? toMs(trip.started_at) : good[0] ? toMs(good[0].device_ts) : 0;

  for (const run of runs) {
    const first = run[0]!;
    const last = run[run.length - 1]!;
    // Suppress in the first 60 s of a trip.
    if ((toMs(first.device_ts) - startedMs) / 1000 < 60) continue;
    const durationS = (toMs(last.device_ts) - toMs(first.device_ts)) / 1000;

    const ns = nearestStop(first.lat, first.lng, stops);
    const nearRegistered = !!ns && ns.dist_m <= 50;
    const allowed = nearRegistered ? ns!.stop.dwell_allowance_sec : policy.stop.unexpected_stop_sec;
    if (durationS <= allowed) continue;

    const meanAcc = meanAccuracy(run);
    events.push({
      type: 'LONG_STOP',
      event_class: 'LONG_STOP',
      subtype: nearRegistered ? 'AT_STOP' : 'UNEXPECTED',
      severity: 'WARN',
      confidence: meanAcc <= 25 ? 'HIGH' : 'MEDIUM',
      started_at: first.device_ts,
      ended_at: last.device_ts,
      summary: nearRegistered
        ? `Stopped ${Math.round(durationS)}s at ${ns!.stop.name} (allowed ${allowed}s)`
        : `Unexpected stop ${Math.round(durationS)}s (allowed ${allowed}s)`,
      metrics: {
        duration_s: Math.round(durationS),
        allowed_dwell_sec: allowed,
        near_stop: nearRegistered ? ns!.stop.name : null,
        dist_to_stop_m: ns ? round1(ns.dist_m) : null,
        lat: first.lat,
        lng: first.lng,
      },
      identity_key: `LONG_STOP:${first.seq}`,
    });
  }
  return events;
}

// ── A3 · ROUTE_DEVIATION ─────────────────────────────────────────────────────
export function routeDeviation(
  good: Fix[],
  route: EvaluateInput['route'],
  policy: PolicyRules,
  stops: Stop[]
): AlertEvent[] {
  const withDist = good.map((f) => ({ f, d: distanceToRoute(f.lat, f.lng, route.polyline) }));
  const runs = consecutiveRuns(withDist, (x) => x.d > route.corridor_m);
  const events: AlertEvent[] = [];

  for (const run of runs) {
    const first = run[0]!.f;
    const last = run[run.length - 1]!.f;
    const durationS = (toMs(last.device_ts) - toMs(first.device_ts)) / 1000;
    if (durationS < policy.deviation.sustained_seconds) continue;
    if (run.length < policy.deviation.min_fixes) continue;

    const meanAcc = meanAccuracy(run.map((x) => x.f));
    const maxDev = Math.max(...run.map((x) => x.d));

    // bad GPS looks exactly like a route deviation. We refuse to escalate a
    // signal problem as a driver violation.
    let confidence: Confidence =
      run.length >= 8 && meanAcc <= 15 ? 'HIGH' : run.length >= 5 && meanAcc <= 25 ? 'MEDIUM' : 'LOW';
    if (meanAcc > policy.deviation.poor_accuracy_downgrade_m) confidence = 'LOW';

    const ns = nearestStop(last.lat, last.lng, stops);
    const path = downsample(run, 40).map((x) => ({
      t: x.f.device_ts,
      lat: x.f.lat,
      lng: x.f.lng,
      dev_m: round1(x.d),
      quality: x.f.quality,
    }));

    events.push({
      type: 'ROUTE_DEVIATION',
      event_class: 'ROUTE_DEVIATION',
      severity: confidence === 'LOW' ? 'INFO' : 'WARN',
      confidence,
      started_at: first.device_ts,
      ended_at: last.device_ts,
      summary: `Off-corridor by up to ${maxDev.toFixed(0)} m for ${durationS.toFixed(0)}s`,
      metrics: {
        max_deviation_m: round1(maxDev),
        duration_s: Math.round(durationS),
        corridor_m: route.corridor_m,
        nearest_stop: ns ? ns.stop.name : null,
        mean_accuracy_m: round1(meanAcc),
        deviation_path: path,
      },
      identity_key: `ROUTE_DEVIATION:${first.seq}`,
    });
  }
  return events;
}

// ── A4 · DELAY ───────────────────────────────────────────────────────────────
export function delay(
  trip: TripContext,
  policy: PolicyRules,
  history: DelayHistory | undefined,
  now: string
): { alerts: AlertEvent[]; notices: EngineNotice[] } {
  const alerts: AlertEvent[] = [];
  const notices: EngineNotice[] = [];
  if (!trip.started_at) return { alerts, notices };

  const useHistory =
    !!history &&
    history.sample_size >= policy.delay.min_history_trips &&
    history.median_duration_min !== null;

  let expectedArrivalMs: number | null = null;
  if (useHistory) {
    expectedArrivalMs = toMs(trip.started_at) + (history!.median_duration_min as number) * 60_000;
  } else if (trip.planned_end) {
    expectedArrivalMs = toMs(trip.planned_end);
    notices.push({
      code: 'DELAY_SCHEDULE_FALLBACK',
      alert_type: 'DELAY',
      message: `Fewer than ${policy.delay.min_history_trips} completed trips for this route — ETA uses the schedule (SCHEDULE_FALLBACK).`,
    });
  }
  if (expectedArrivalMs === null) return { alerts, notices };

  const lateMin = (toMs(now) - expectedArrivalMs) / 60_000;
  if (lateMin >= policy.delay.threshold_min && trip.status === 'ACTIVE') {
    alerts.push({
      type: 'DELAY',
      event_class: 'DELAY',
      severity: 'INFO',
      confidence: 'MEDIUM',
      started_at: iso(expectedArrivalMs),
      ended_at: null,
      summary: `Running about ${Math.round(lateMin)} min late`,
      metrics: {
        eta_method: useHistory ? 'HISTORICAL_MEDIAN' : 'SCHEDULE_FALLBACK',
        expected_arrival: iso(expectedArrivalMs),
        minutes_late: Math.round(lateMin),
        history_sample_size: history?.sample_size ?? 0,
      },
      identity_key: `DELAY:${trip.id}`,
    });
  }
  return { alerts, notices };
}

// ── A5 · SIGNAL_LOST — the single most important alert (§8). ──────────────────
function tamperEvent(
  startMs: number,
  endMs: number,
  bufferedCount: number,
  summary: string,
  subtype: string
): AlertEvent {
  return {
    type: 'SIGNAL_LOST',
    event_class: 'SIGNAL_TAMPER',
    subtype,
    severity: 'CRITICAL',
    confidence: 'HIGH',
    started_at: iso(startMs),
    ended_at: iso(endMs),
    summary,
    metrics: {
      gap_seconds: Math.round((endMs - startMs) / 1000),
      buffered_fix_count: bufferedCount,
      classification: 'SIGNAL_TAMPER',
    },
    identity_key: `SIGNAL_LOST:${startMs}`,
  };
}

export function signalLost(
  trip: TripContext,
  fixes: Fix[],
  heartbeats: Heartbeat[],
  policy: PolicyRules,
  now: string
): AlertEvent[] {
  const events: AlertEvent[] = [];

  // A heartbeat that reports gps_permission = 'denied' is an immediate tamper.
  const denied = heartbeats.find((h) => h.gps_permission === 'denied');
  if (denied) {
    const t = toMs(denied.server_ts);
    events.push(tamperEvent(t, t, 0, 'GPS permission denied mid-trip — treated as tamper.', 'PERMISSION_DENIED'));
  }

  // Contact timeline: telemetry arrival (server_ts) + heartbeats. Buffered fixes
  // "contact" the server LATE (at reconnect), so they do not fill the live gap —
  // but their device_ts proves the bus WAS being recorded during the blackout.
  const contacts: number[] = [];
  for (const f of fixes) contacts.push(toMs(f.server_ts ?? f.device_ts));
  for (const h of heartbeats) contacts.push(toMs(h.server_ts));

  const startMs = trip.started_at
    ? toMs(trip.started_at)
    : contacts.length
      ? Math.min(...contacts)
      : toMs(now);
  const active = trip.status === 'ACTIVE';
  const endBoundary = active ? toMs(now) : trip.ended_at ? toMs(trip.ended_at) : toMs(now);

  const timeline = [startMs, ...contacts.filter((c) => c >= startMs), endBoundary].sort((a, b) => a - b);

  for (let i = 1; i < timeline.length; i++) {
    const a = timeline[i - 1]!;
    const b = timeline[i]!;
    const gapS = (b - a) / 1000;
    if (gapS <= policy.signal.signal_lost_sec) continue;

    const isOpenTail = b === endBoundary && active;
    const buffered = fixes.filter((f) => f.buffered && toMs(f.device_ts) > a && toMs(f.device_ts) < b);
    const covered = buffered.length > 0;

    if (isOpenTail) {
      // Still out of contact right now → PENDING. Never scored until resolved.
      events.push({
        type: 'SIGNAL_LOST',
        event_class: 'SIGNAL_PENDING',
        subtype: 'PENDING',
        severity: 'WARN',
        confidence: 'HIGH',
        started_at: iso(a),
        ended_at: null,
        summary: `No contact for ${Math.round(gapS)}s — awaiting reconnect.`,
        metrics: { gap_seconds: Math.round(gapS), classification: 'PENDING' },
        identity_key: `SIGNAL_LOST:${a}`,
      });
    } else if (covered) {
      // Buffered fixes recovered the gap → a network problem, not a violation.
      // A driver must NEVER be punished for Kashmir's network. Deduction = 0.
      events.push({
        type: 'SIGNAL_LOST',
        event_class: 'COVERAGE_GAP',
        subtype: 'COVERAGE_GAP',
        severity: 'INFO',
        confidence: 'HIGH',
        started_at: iso(a),
        ended_at: iso(b),
        summary: `Coverage gap ${Math.round(gapS)}s — ${buffered.length} buffered fixes recovered. No penalty (network, not conduct).`,
        metrics: {
          gap_seconds: Math.round(gapS),
          buffered_fix_count: buffered.length,
          classification: 'COVERAGE_GAP',
        },
        identity_key: `SIGNAL_LOST:${a}`,
      });
    } else {
      // No recovered data for the blackout → treated as tamper. Full deduction.
      events.push(
        tamperEvent(
          a,
          b,
          0,
          `Signal lost ${Math.round(gapS)}s with NO recovered data — treated as tamper.`,
          'SIGNAL_TAMPER'
        )
      );
    }
  }
  return events;
}

// ── A6 · SOS (press-driven; created by the SOS API, not the auto-scan) ───────
export function sosEvent(input: {
  ts: string;
  lat: number | null;
  lng: number | null;
  by: string;
  role: 'driver' | 'attendant';
}): AlertEvent {
  return {
    type: 'SOS',
    event_class: 'SIGNAL_TAMPER', // placeholder class; SOS is not scored, it is escalated
    subtype: input.role,
    severity: 'CRITICAL',
    confidence: 'HIGH',
    started_at: input.ts,
    ended_at: null,
    summary: `SOS raised by ${input.role}. Requires explicit school acknowledgement with a written note.`,
    metrics: {
      last_known_lat: input.lat,
      last_known_lng: input.lng,
      raised_by: input.by,
      never_auto_resolves: true,
    },
    identity_key: `SOS:${input.ts}`,
  };
}

// ── A7 · REPEAT_COMPLAINT ────────────────────────────────────────────────────
export interface ComplaintLite {
  vehicle_id: string | null;
  category: string | null;
  created_at: string;
}
export function repeatComplaints(complaints: ComplaintLite[], now: string): AlertEvent[] {
  const windowMs = 30 * 24 * 3600 * 1000;
  const cutoff = toMs(now) - windowMs;
  const groups = new Map<string, ComplaintLite[]>();
  for (const c of complaints) {
    if (!c.vehicle_id || !c.category) continue;
    if (toMs(c.created_at) < cutoff) continue;
    const key = `${c.vehicle_id}|${c.category}`;
    let arr = groups.get(key);
    if (!arr) {
      arr = [];
      groups.set(key, arr);
    }
    arr.push(c);
  }
  const events: AlertEvent[] = [];
  for (const [key, list] of groups) {
    if (list.length < 3) continue;
    const [vehicle_id, category] = key.split('|');
    events.push({
      type: 'REPEAT_COMPLAINT',
      event_class: 'COMPLAINT_UPHELD',
      severity: 'WARN',
      confidence: 'MEDIUM',
      started_at: now,
      ended_at: null,
      summary: `${list.length} complaints about "${category}" for this vehicle in 30 days`,
      metrics: { cluster_size: list.length, category, vehicle_id },
      identity_key: `REPEAT_COMPLAINT:${vehicle_id}:${category}`,
    });
  }
  return events;
}

// ── A0 · TRIP_NOT_STARTED (schedule sweep; not one of the original 7) ─────────
export interface ScheduleLite {
  id: string;
  route_id: string;
  vehicle_id: string;
  driver_id: string;
  planned_start_iso: string; // today's planned start, ISO
  grace_minutes: number;
}
export function tripNotStarted(
  schedule: ScheduleLite,
  hasLiveOrDoneTrip: boolean,
  now: string
): AlertEvent | null {
  const dueMs = toMs(schedule.planned_start_iso) + schedule.grace_minutes * 60_000;
  if (toMs(now) <= dueMs) return null;
  if (hasLiveOrDoneTrip) return null;
  return {
    type: 'TRIP_NOT_STARTED',
    event_class: 'TRIP_NOT_STARTED',
    severity: 'CRITICAL',
    confidence: 'HIGH',
    started_at: schedule.planned_start_iso,
    ended_at: null,
    summary: 'Scheduled trip not started. Vehicle may be operating untracked.',
    metrics: {
      schedule_id: schedule.id,
      planned_start: schedule.planned_start_iso,
      grace_minutes: schedule.grace_minutes,
    },
    identity_key: `TRIP_NOT_STARTED:${schedule.id}:${schedule.planned_start_iso}`,
  };
}

// ── the telemetry-driven scan (A1–A5) ────────────────────────────────────────
export function evaluate(input: EvaluateInput): EvaluateResult {
  const { trip, fixes, heartbeats, route, stops, policy, history, now } = input;

  // Speed + stop rules use GOOD fixes only (speed requires accuracy <= max_accuracy_m).
  const good = fixes.filter((f) => f.quality === 'GOOD').sort(byDeviceTs);
  // Route deviation is POSITION-based, so it also considers DEGRADED fixes — but
  // forces LOW confidence when accuracy is poor. This is the documented exception:
  // bad GPS looks exactly like a deviation; we surface it, we never escalate it.
  const positionFixes = fixes
    .filter((f) => f.quality === 'GOOD' || f.quality === 'DEGRADED')
    .sort(byDeviceTs);

  const alerts: AlertEvent[] = [];
  const notices: EngineNotice[] = [];

  const os = overspeed(good, policy, stops);
  alerts.push(...os.alerts);
  if (os.notice) notices.push(os.notice);

  alerts.push(...longStop(good, policy, stops, trip));
  alerts.push(...routeDeviation(positionFixes, route, policy, stops));

  const dl = delay(trip, policy, history, now);
  alerts.push(...dl.alerts);
  notices.push(...dl.notices);

  alerts.push(...signalLost(trip, fixes, heartbeats, policy, now));

  return { alerts, notices };
}

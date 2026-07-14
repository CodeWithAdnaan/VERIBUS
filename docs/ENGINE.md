# VERIBUS SEAL — Engine spec (Signal · Evidence · Alerts · Ledger)

The four modules that make up **SEAL**: **S** · Signal Quality (`lib/engine/signal.ts`) · **E** ·
Evidence Ledger (`lib/engine/chain.ts`) · **A** · Alerts (`lib/engine/alerts.ts`) · **L** ·
Compliance Ledger (`lib/engine/score.ts`).

This document specifies the pure evaluation engine. Every rule below is implemented in
`lib/engine/` and covered by a test in `tests/engine/`. The engine reads **all** thresholds
from policy (`policy_config.rules`, shape `PolicyRules` in `lib/engine/types.ts`); there are
no magic numbers in the rule code. The values quoted here are the active `RTO_JK_v1` config
in `db/seed.sql` (identical to `testPolicy()` in `tests/engine/_fixtures.ts`).

Source of truth:
- Rules: `lib/engine/alerts.ts`
- Signal quality: `lib/engine/signal.ts`
- Scoring: `lib/engine/score.ts`
- Geometry: `lib/engine/geo.ts`
- Start gate: `lib/engine/gate.ts`
- Chain: `lib/engine/chain.ts`
- Types: `lib/engine/types.ts`

Status of the engine: **BUILT**. All 8 rules (A0–A7), the signal state machine, the start
gate, the scoring ledger, and the hash chain are implemented as pure functions and unit-tested.

---

## 0. Contract of the engine

`evaluate(input: EvaluateInput): EvaluateResult` (`lib/engine/alerts.ts:521`) is deterministic:
the same `input` always yields the same `alerts` and `notices`. It performs no I/O. The ingest
path (`lib/server/ingest.ts`) loads state from the DB, calls `evaluate`, then reconciles the
result; the engine itself never touches Postgres.

Two invariants the whole engine rests on:

1. **Speed comes only from GPS Doppler** (`Fix.speed_mps`, `lib/engine/types.ts:44`). The engine
   never derives speed from distance ÷ time. Test #4 (`tests/engine/overspeed.test.ts:60`) feeds
   1 km position jumps with `speed_mps = null` and asserts zero alerts.
2. **The server is the source of truth for time.** `now` is passed in as an ISO string
   (`EvaluateInput.now`, `types.ts:136`); the ingest path stamps `server_ts = now()` on every
   fix (`lib/server/ingest.ts:252`). Device clocks are used for ordering (`device_ts`) but never
   trusted for "is the bus out of contact right now".

Signal quality runs **first** (Section 1). The rules then evaluate only the fixes they are
allowed to (Section 2).

---

## 1. Signal quality classification (`lib/engine/signal.ts`)

`classifyFix(fix, policy)` assigns one of three qualities, in this order:

| Quality  | Condition | Meaning |
|---|---|---|
| `GOOD`     | `accuracy_m <= speed.max_accuracy_m` **and** `speed_mps !== null` | usable for speed and stop rules |
| `DEGRADED` | otherwise, `accuracy_m <= signal.degraded_accuracy_m` (default 60) | position usable, speed not trusted |
| `REJECTED` | otherwise | dropped from all rule evaluation |

Active thresholds: `max_accuracy_m = 25`, `degraded_accuracy_m = 60`.

The alert engine evaluates **only `GOOD` fixes** for speed and stop rules. `DEGRADED` fixes may
only **downgrade** confidence, never trigger — with one documented exception (route deviation,
A3) which is position-based and therefore also reads `DEGRADED` fixes but is forced to `LOW`
confidence when accuracy is poor. Test #3 (`tests/engine/overspeed.test.ts:51`) proves accuracy
40 m (> 25) is excluded from speed evaluation.

---

## 2. Alert rules A0–A7

Each rule below lists: inputs, the exact firing rule, the policy keys it reads, the confidence
rule, the metrics keys written, and the `identity_key`. The `identity_key` is the stable dedupe
key — re-evaluation upserts by it and never creates a duplicate (`reconcileAlerts`,
`lib/server/ingest.ts:93`; unique constraint `alerts(trip_id, identity_key)`, `db/schema.sql:248`).

### A1 · OVERSPEED — `overspeed()` (`lib/engine/alerts.ts:66`)

- **Inputs:** `GOOD` fixes (sorted by `device_ts`), `policy`, `stops`.
- **Policy keys:** `speed.default_limit_kmh`, `speed.tolerance_kmh`, `speed.sustained_seconds`,
  `speed.min_consecutive_fixes`, `speed.cooldown_seconds`, `speed.limit_source`.
- **Disabled path:** if `default_limit_kmh` is `null`/`undefined`, the rule returns **no alerts**
  and a `POLICY_UNSET` notice. The system never asserts a legal limit on its own authority.
- **Rule:** find maximal consecutive runs where `kmh(speed_mps) > limit + tolerance`. A run fires
  one alert iff its span `>= sustained_seconds` (8 s), its length `>= min_consecutive_fixes` (4),
  and it starts at least `cooldown_seconds` (120 s) after the previous window closed. One
  sustained window = exactly one alert. Test #1 (`overspeed.test.ts:26`) asserts one alert for a
  sustained window; test #2 (`overspeed.test.ts:39`) asserts a 1-second spike fires zero.
- **Confidence:** `HIGH` if `fix_count >= 6 && mean_accuracy_m <= 15`; else `MEDIUM` if
  `fix_count >= 4 && mean_accuracy_m <= 25`; else `LOW`. Severity is `CRITICAL` when `HIGH`,
  otherwise `WARN`.
- **Metrics keys:** `peak_speed_kmh`, `mean_speed_kmh`, `duration_s`, `fix_count`,
  `mean_accuracy_m`, `limit_applied`, `limit_source`, `nearest_stop_pair`, `speed_series`
  (violation window only, downsampled to <= 40 points).
- **identity_key:** `OVERSPEED:<first.seq>`.

### A2 · LONG_STOP — `longStop()` (`lib/engine/alerts.ts:142`)

- **Inputs:** `GOOD` fixes, `policy`, `stops`, `trip`.
- **Policy keys:** `stop.movement_threshold_mps` (1.0), `stop.unexpected_stop_sec` (300);
  per-stop `dwell_allowance_sec` comes from the `stops` row.
- **Rule:** find runs where `speed_mps < movement_threshold_mps`. Suppress any stop within the
  first 60 s of the trip. For each run, the allowed dwell is the registered stop's
  `dwell_allowance_sec` when the run starts within 50 m of a stop, else `unexpected_stop_sec`.
  Fire when `duration > allowed`.
- **Confidence:** `HIGH` if `mean_accuracy_m <= 25`, else `MEDIUM`. Severity `WARN`. `subtype`
  is `AT_STOP` (near a registered stop) or `UNEXPECTED`.
- **Metrics keys:** `duration_s`, `allowed_dwell_sec`, `near_stop`, `dist_to_stop_m`, `lat`, `lng`.
- **identity_key:** `LONG_STOP:<first.seq>`.

### A3 · ROUTE_DEVIATION — `routeDeviation()` (`lib/engine/alerts.ts:193`)

- **Inputs:** position fixes (`GOOD` **or** `DEGRADED`, sorted), `route`, `policy`, `stops`.
- **Policy keys:** `deviation.sustained_seconds` (45), `deviation.min_fixes` (5),
  `deviation.poor_accuracy_downgrade_m` (25); `route.corridor_m` (60) from the route row.
- **Rule:** compute perpendicular distance of each fix to the route polyline
  (`distanceToRoute`, `lib/engine/geo.ts:21`, turf `pointToLineDistance`). Find runs where
  `dist > corridor_m`. Fire when the run's span `>= sustained_seconds` and length `>= min_fixes`.
- **Confidence:** `HIGH` if `run >= 8 && mean_accuracy_m <= 15`; else `MEDIUM` if
  `run >= 5 && mean_accuracy_m <= 25`; else `LOW`. **Then forced to `LOW`** when
  `mean_accuracy_m > poor_accuracy_downgrade_m`. Bad GPS looks exactly like a deviation, so the
  engine surfaces it but refuses to escalate it. Severity is `INFO` at `LOW`, else `WARN`.
  Test #5 (`tests/engine/deviation.test.ts:30`) proves accuracy 40 m forces `LOW`; the control
  (`deviation.test.ts:37`) proves good accuracy does not.
- **Metrics keys:** `max_deviation_m`, `duration_s`, `corridor_m`, `nearest_stop`,
  `mean_accuracy_m`, `deviation_path` (<= 40 points).
- **identity_key:** `ROUTE_DEVIATION:<first.seq>`.

### A4 · DELAY — `delay()` (`lib/engine/alerts.ts:251`)

- **Inputs:** `trip`, `policy`, `history` (`DelayHistory`, computed by the caller), `now`.
- **Policy keys:** `delay.threshold_min` (10), `delay.min_history_trips` (3).
- **Rule:** if `history.sample_size >= min_history_trips` and a median exists, expected arrival =
  `started_at + median_duration_min`. Otherwise fall back to `planned_end` and emit a
  `DELAY_SCHEDULE_FALLBACK` notice. Fire when `minutes_late >= threshold_min` and the trip is
  `ACTIVE`. There is **no external traffic or weather API**; ETA uses this system's own completed
  trips only.
- **Confidence:** `MEDIUM`. Severity `INFO`.
- **Metrics keys:** `eta_method` (`HISTORICAL_MEDIAN` | `SCHEDULE_FALLBACK`), `expected_arrival`,
  `minutes_late`, `history_sample_size`.
- **identity_key:** `DELAY:<trip.id>`.
- **Status:** BUILT. DELAY is on the §19 cut list (last to drop); it is present but is the
  lowest-severity rule.

### A5 · SIGNAL_LOST — `signalLost()` (`lib/engine/alerts.ts:327`)

The most important rule. Full state machine in Section 3.

- **Inputs:** `trip`, all fixes (including `buffered`), `heartbeats`, `policy`, `now`.
- **Policy keys:** `signal.signal_lost_sec` (120).
- **Metrics keys:** `gap_seconds`, `buffered_fix_count`, `classification`
  (`PENDING` | `COVERAGE_GAP` | `SIGNAL_TAMPER`).
- **identity_key:** `SIGNAL_LOST:<startMs>` (millisecond epoch of the gap start).
- Tests #6 and #7 (`tests/engine/signal.test.ts:11`, `:37`) pin the coverage-gap vs tamper split.

### A6 · SOS — `sosEvent()` (`lib/engine/alerts.ts:420`)

- **Inputs:** built by `POST /api/trip/sos` (`app/api/trip/sos/route.ts`) from a press-and-hold,
  not by the telemetry scan. `lat`/`lng` default to the last `GOOD` fix.
- **Rule:** always produce one `CRITICAL` / `HIGH` alert. `metrics.never_auto_resolves = true`;
  it requires an explicit school acknowledgement with a written note. It is **never scored**
  (see A6 mapping in Section 4).
- **Metrics keys:** `last_known_lat`, `last_known_lng`, `raised_by`, `never_auto_resolves`.
- **identity_key:** `SOS:<ts>`.

### A7 · REPEAT_COMPLAINT — `repeatComplaints()` (`lib/engine/alerts.ts:452`)

- **Inputs:** complaint rows (`vehicle_id`, `category`, `created_at`), `now`.
- **Rule:** within a rolling 30-day window, group by `vehicle_id | category`; emit one alert per
  group with `>= 3` complaints. This is a **cluster flag**, not a score event — only an *upheld*
  complaint deducts (Section 4).
- **Confidence:** `MEDIUM`. Severity `WARN`.
- **Metrics keys:** `cluster_size`, `category`, `vehicle_id`.
- **identity_key:** `REPEAT_COMPLAINT:<vehicle_id>:<category>`.

### A0 · TRIP_NOT_STARTED — `tripNotStarted()` (`lib/engine/alerts.ts:495`)

- **Inputs:** a `ScheduleLite` (from `trip_schedules`), whether a live/done trip exists, `now`.
- **Rule:** `due = planned_start + grace_minutes`. If `now <= due`, return null. If a
  `PRE_CHECK`/`ACTIVE`/`COMPLETED` trip already exists for the schedule, return null. Otherwise
  emit one `CRITICAL` / `HIGH` alert: the vehicle may be operating untracked. Driven by the
  watchdog sweep (`app/api/cron/watchdog/route.ts`), not the ingest path.
- **Metrics keys:** `schedule_id`, `planned_start`, `grace_minutes`.
- **identity_key:** `TRIP_NOT_STARTED:<schedule.id>:<planned_start_iso>`.

---

## 3. The signal-lost state machine (precise)

`signalLost()` builds a **contact timeline** and classifies every gap in it. This is the ethical
core of the system: a driver in Kashmir's coverage must never be punished for the network, and a
driver who switches GPS off must not be able to hide behind "bad signal".

**Step 1 — immediate tamper on denial.** Any heartbeat with `gps_permission = 'denied'` emits a
`SIGNAL_TAMPER` alert with `subtype = 'PERMISSION_DENIED'` at that instant
(`lib/engine/alerts.ts:337`). Proven by `tests/engine/signal.test.ts:58`.

**Step 2 — build the contact timeline.**
- Contacts = each fix's `server_ts` (fallback `device_ts`) **plus** each heartbeat's `server_ts`.
  Buffered fixes contact the server **late** (at reconnect), so they do not fill the live gap —
  but their `device_ts` proves the bus *was* being recorded during the blackout.
- `startMs` = `trip.started_at` (fallback: earliest contact, or `now`).
- `endBoundary` = `now` if the trip is `ACTIVE`, else `trip.ended_at` (fallback `now`).
- `timeline = sort([startMs, ...contacts >= startMs, endBoundary])`.

**Step 3 — classify each interval `(a, b)` where `b - a > signal_lost_sec` (120 s):**

```
                 gap (a,b) longer than signal_lost_sec (120s)
                                  |
          +-----------------------+------------------------+
          |                       |                        |
   b == endBoundary        buffered device fixes     no recovered data
   AND trip ACTIVE         exist inside (a,b)         inside (a,b)
          |                       |                        |
     SIGNAL_PENDING          COVERAGE_GAP             SIGNAL_TAMPER
     subtype PENDING         subtype COVERAGE_GAP     subtype SIGNAL_TAMPER
     severity WARN           severity INFO            severity CRITICAL
     confidence HIGH         confidence HIGH          confidence HIGH
     NEVER scored            deduction 0              full deduction
     (awaiting reconnect)    (network, not conduct)   (treated as tamper)
```

- `PENDING` (`event_class = SIGNAL_PENDING`): still out of contact *right now*. Never scored —
  its class carries no weight in the deductions map (`types.ts:31`), and `alertEventClass`
  returns null for `PENDING` (`lib/server/ledger.ts:36`). It resolves to `COVERAGE_GAP` or
  `SIGNAL_TAMPER` on the next re-evaluation once the trip reconnects or ends.
- `COVERAGE_GAP`: buffered fixes recovered the blackout window. `deduction = 0`. Test #6
  (`signal.test.ts:11`) asserts `applied = 0`, `final = 100`.
- `SIGNAL_TAMPER`: nothing recovered. Full deduction. Test #7 (`signal.test.ts:37`) asserts
  `applied = 6`, `final = 94`.

The two outcomes look completely different in the ledger and the UI — that difference is DoD #5.

---

## 4. Scoring formula and decay (`lib/engine/score.ts`)

`computeScore({ events, docLines, policy, policyVersion, now }) -> DeductionLedger` is
deterministic: the same events + `policy_version` + `now` produce an identical, line-by-line
ledger. Test #10 (`tests/engine/score.test.ts:16`) proves reproducibility regardless of input
order (events are sorted by `occurred_at`, then `event_class`, then `alert_id`).

**Formula:**

```
final = clamp(
  base
  - Σ over event lines   ( raw_weight[class] × conf_mult[confidence] × decay(age_days) )
  - Σ over document lines( raw_weight[DOC_EXPIRED] ),          // docs: no decay, no conf discount
  0, 100
)
```

**Active weights (`RTO_JK_v1`):** `base = 100`;
`deductions = { TRIP_NOT_STARTED 8, SIGNAL_TAMPER 6, ROUTE_DEVIATION 5, OVERSPEED 4,
COMPLAINT_UPHELD 4, PRECHECK_FAILED_BLOCKING 5, LONG_STOP 3, DOC_EXPIRED 10, COVERAGE_GAP 0 }`;
`confidence_multiplier = { HIGH 1.0, MEDIUM 0.5, LOW 0.0 }`;
`decay = { half_weight_after_days 45, drop_after_days 90 }`.

**Decay (`decayMult`, `score.ts:20`):**

```
age_days >= drop_after_days (90)   -> 0     // dropped entirely
age_days <= 0                      -> 1
otherwise                          -> 0.5 ^ (age_days / half_weight_after_days)   // half after 45 days
```

**Notes that fall out of the formula:**
- `LOW` confidence multiplies to 0, so a low-confidence event contributes nothing. Proven for a
  `LOW` deviation line in `tests/engine/score.test.ts:28` (`applied = 0`).
- An unknown `event_class` has no weight and contributes 0 — this is how `SIGNAL_PENDING` stays
  unscored (`score.ts:52`).
- Documents do not decay and carry no confidence discount: expired is expired
  (`score.ts:71`, `conf_mult = 1`, `decay_mult = 1`).
- The ledger renders as a receipt (`components/charts/DeductionReceipt.tsx`), never a donut, and
  always shows its `policy_version` (DoD #8).

**Alert → score class mapping** — the one place it happens is `alertEventClass()`
(`lib/server/ledger.ts:25`):

| Alert `type` (+`subtype`) | Score class | Note |
|---|---|---|
| OVERSPEED | OVERSPEED | |
| LONG_STOP | LONG_STOP | |
| ROUTE_DEVIATION | ROUTE_DEVIATION | |
| DELAY | DELAY | |
| TRIP_NOT_STARTED | TRIP_NOT_STARTED | |
| SIGNAL_LOST + COVERAGE_GAP | COVERAGE_GAP | weight 0 — never punished for the network |
| SIGNAL_LOST + PENDING | *(null)* | not scored until resolved |
| SIGNAL_LOST + (tamper) | SIGNAL_TAMPER | full deduction |
| SOS | *(null)* | escalated, never scored |
| REPEAT_COMPLAINT | *(null)* | cluster flag; only an **upheld** complaint deducts |

`computeVehicleLedger` (`lib/server/ledger.ts:57`) additionally: skips `DISMISSED` alerts, adds a
`COMPLAINT_UPHELD` event for each `complaints.upheld = true`, and adds a `DOC_EXPIRED` line for
each expired `fitness/permit/insurance/puc` date (`isExpired`, `lib/format.ts`).

---

## 5. Start gate (`lib/engine/gate.ts`)

`evaluateStartGate(input)` is the anti-gaming layer as a pure function. `POST /api/trip/start`
calls it (`app/api/trip/start/route.ts:48`). Order and codes:

1. `require_bind` and not bound -> `409 BIND_REQUIRED` (test #11, `tests/engine/gate.test.ts:13`).
2. `require_precheck` and a **blocking** pre-check item is answered `ok:false` ->
   `409 PRECHECK_FAILED` (test #12, `gate.test.ts:28`). The route also returns
   `409 PRECHECK_REQUIRED` when no pre-check was performed at all (`start/route.ts:44`).
3. `require_attendant` and the school requires one and no attendant checked in ->
   `409 ATTENDANT_REQUIRED`.

A checklist that cannot block anything is decoration; these 409s are DoD #1 and #2.

---

## 6. Evidence hash chain (`lib/engine/chain.ts`)

- `canonicalJson(value)` — JSON with keys sorted recursively, arrays preserved, no whitespace.
  Proven by `tests/engine/chain.test.ts:34`.
- `genesis(tripId) = sha256("<tripId>|GENESIS")`.
- `recordHash = sha256("<tripId>|<seq>|<kind>|<canonicalJson(payload)>|<prev_hash>")`.
- `verifyChain(tripId, records)` recomputes the whole chain from genesis and reports the **first**
  break as `broken_at_seq`. A break is either a wrong `prev_hash` link or a payload that no longer
  hashes to its stored `record_hash`. Test #8 (`chain.test.ts:15`) verifies a clean chain; test #9
  (`chain.test.ts:24`) mutates seq 2's payload and asserts `broken_at_seq = 2`.
- Records are append-only. `appendEvidence` (`lib/server/evidence.ts:12`) reads the trip's
  `chain_head` as the previous hash, uses `max(seq)+1`, inserts, then advances `chain_head`.
  The public verdict endpoint is `GET /api/evidence/verify?trip_id=` (`verifyTripChain`,
  `lib/server/evidence.ts:46`).

---

## 7. Test index (§18)

`npm test` runs Vitest (`vitest.config.ts`, `package.json`) over `tests/engine/**` — pure
functions, no database or credentials required. There are **17** `it()` cases across 6 files, all
passing (**17/17**). Twelve of them are the numbered §18 acceptance tests:

| # | Assertion | File |
|---|---|---|
| 1 | one sustained overspeed → exactly one alert | `tests/engine/overspeed.test.ts:26` |
| 2 | 1-second spike → zero alerts | `tests/engine/overspeed.test.ts:39` |
| 3 | poor-accuracy fixes excluded from speed | `tests/engine/overspeed.test.ts:51` |
| 4 | never derive speed from position when `speed_mps` null | `tests/engine/overspeed.test.ts:60` |
| 5 | deviation forced to LOW on poor accuracy | `tests/engine/deviation.test.ts:30` |
| 6 | backfilled gap → COVERAGE_GAP, deduction 0 | `tests/engine/signal.test.ts:11` |
| 7 | unrecovered gap → SIGNAL_TAMPER, full deduction | `tests/engine/signal.test.ts:37` |
| 8 | clean chain verifies | `tests/engine/chain.test.ts:15` |
| 9 | mutated payload → `broken_at_seq` = N | `tests/engine/chain.test.ts:24` |
| 10 | score reproducible regardless of input order | `tests/engine/score.test.ts:16` |
| 11 | start rejected 409 `BIND_REQUIRED` when unbound | `tests/engine/gate.test.ts:13` |
| 12 | start rejected 409 `PRECHECK_FAILED` on blocking fail | `tests/engine/gate.test.ts:28` |

The five supporting cases: permission-denied tamper (`signal.test.ts:58`), deviation good-accuracy
control (`deviation.test.ts:37`), `canonicalJson` key order (`chain.test.ts:34`), gate pass
(`gate.test.ts:42`), and confidence-multiplier/clamp (`score.test.ts:28`).

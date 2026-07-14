# VERIBUS — Traceability

Every problem-statement requirement mapped to the code, route, and test that satisfies it. Routes
marked "(surface)" are where a capability is presented; the capability itself is grounded in the
file/test in the same row. Status labels: `BUILT` · `BUILT (DEMO DATA)` · `PARTIAL` ·
`NOT BUILT — PILOT GAP`.

## Core thesis and privacy

| Requirement | Satisfied by | Status |
|---|---|---|
| Evidence the RTO can legally act on (not just a track) | `lib/engine/chain.ts` (SHA-256 chain) + `lib/server/evidence.ts` + `GET /api/evidence/verify` + `/rto/memo/[vehicleId]` (surface) | BUILT |
| Tamper is detectable at the exact record | `verifyChain` → `broken_at_seq` (`lib/engine/chain.ts:75`); test #9 `tests/engine/chain.test.ts:24` | BUILT |
| "Track the bus, not the child" | `students` has **no** location/tracking column (`db/schema.sql:99`); enforced by absence | BUILT |
| Parent sees the bus, not other children | `parent_active_assigned_trip_only` RLS (`db/policies.sql:49`); test T5 `db/rls.test.sql:80` | BUILT |
| Verifiable parental consent for children's data (DPDP, in substance) | `consents.granted_at`/`withdrawn_at` (`db/schema.sql:121`); withdrawal revokes via the RLS join (`db/policies.sql:57`) | BUILT |
| Minimum collection / no over-reach, provable in the DB | RLS on only 4 tables (`db/policies.sql:29`); RTO has no telemetry/trip SELECT policy | BUILT |

## Signal integrity (the ethical core)

| Requirement | Satisfied by | Status |
|---|---|---|
| GPS off (no data) → tamper; network drop (backfill) → coverage gap; the two look different | `signalLost` (`lib/engine/alerts.ts:327`); tests #6/#7 `tests/engine/signal.test.ts:11,:37` | BUILT |
| A driver is never punished for the network | `COVERAGE_GAP` weight 0 (`db/seed.sql:123`); `applied=0` in test #6 | BUILT |
| A driver cannot hide behind "bad signal" | unrecovered gap → `SIGNAL_TAMPER` full deduction; permission-denied → immediate tamper (`alerts.ts:337`, test `signal.test.ts:58`) | BUILT |
| Still-out-of-contact is not scored prematurely | `SIGNAL_PENDING` carries no weight (`lib/engine/types.ts:31`; `lib/server/ledger.ts:36`) | BUILT |
| Speed only from GPS Doppler, never distance/time | `Fix.speed_mps` (`types.ts:44`); test #4 `overspeed.test.ts:60` | BUILT |
| Bad GPS is surfaced, never escalated | route-deviation confidence forced LOW on poor accuracy (`alerts.ts:217`; test #5 `deviation.test.ts:30`) | BUILT |
| Honest "time we could not see the bus" | `trips.gap_seconds` aggregate (`db/schema.sql:173`; `lib/server/ingest.ts:177`) | BUILT |

## Anti-gaming at trip start (§9)

| Requirement | Satisfied by | Status |
|---|---|---|
| No trip start without QR bind | `evaluateStartGate` → `409 BIND_REQUIRED` (`lib/engine/gate.ts:36`); `/api/trip/bind` HMAC (`lib/server/bind.ts`); test #11 `gate.test.ts:13` | BUILT |
| No start with a failed blocking pre-check | `409 PRECHECK_FAILED` (`gate.ts:46`); `409 PRECHECK_REQUIRED` when none done (`app/api/trip/start/route.ts:44`); test #12 `gate.test.ts:28` | BUILT |
| Attendant check-in when the school requires it | `409 ATTENDANT_REQUIRED` (`gate.ts:60`); `schools.require_attendant` (`db/schema.sql:45`) | BUILT |
| Wrong-vehicle / phone-left-behind defeated | `/api/trip/bind` → `409 WRONG_VEHICLE`; bind geofence flag (`app/api/trip/bind/route.ts:41`) | PARTIAL (sticker is photographable — `qr-photographable`) |

## Alerts (§8)

| Requirement | Satisfied by | Status |
|---|---|---|
| Sustained overspeed → exactly one HIGH-confidence alert + evidence | `overspeed` (`alerts.ts:66`); test #1 `overspeed.test.ts:26`; evidence via `reconcileAlerts` (`lib/server/ingest.ts:121`) | BUILT |
| 1-second spike → zero alerts | `sustained_seconds`/`min_consecutive_fixes` gates; test #2 `overspeed.test.ts:39` | BUILT |
| Overspeed disabled until a limit + source are set | `POLICY_UNSET` notice path (`alerts.ts:72`); `speedPolicyBanner` (`lib/engine/policy.ts:25`) | BUILT |
| Long stop / unexpected stop | `longStop` (`alerts.ts:142`) using per-stop `dwell_allowance_sec` | BUILT |
| Route deviation off corridor | `routeDeviation` (`alerts.ts:193`); `distanceToRoute` (`lib/engine/geo.ts:21`) | BUILT |
| Delay from own history, no external API | `delay` (`alerts.ts:251`), `HISTORICAL_MEDIAN`/`SCHEDULE_FALLBACK` | BUILT |
| SOS never auto-resolves | `sosEvent` (`alerts.ts:420`, `never_auto_resolves`); `/api/trip/sos` | BUILT |
| Repeat-complaint cluster (only upheld deducts) | `repeatComplaints` (`alerts.ts:452`); scored only via `upheld` (`lib/server/ledger.ts:80`) | BUILT |
| Scheduled trip not started → flagged | `tripNotStarted` (`alerts.ts:495`); watchdog (`app/api/cron/watchdog/route.ts`) | BUILT (trigger is a button in dev — `cron-on-deploy`) |

## Compliance ledger (§11)

| Requirement | Satisfied by | Status |
|---|---|---|
| Score is a line-by-line ledger, not a black box | `computeScore` → `DeductionLedger` (`lib/engine/score.ts`); rendered by `components/charts/DeductionReceipt.tsx` | BUILT |
| Ledger shows its `policy_version` | `DeductionLedger.policy_version` (`score.ts:98`); `trips.policy_version` (`db/schema.sql:175`) | BUILT |
| Reproducible score (same input → same ledger) | deterministic sort (`score.ts:41`); test #10 `score.test.ts:16` | BUILT |
| Old events fade; very old events drop | `decayMult` (`score.ts:20`), `half_weight_after_days` 45 / `drop_after_days` 90 | BUILT |
| Low-confidence events do not deduct | `confidence_multiplier.LOW = 0` (`db/seed.sql:125`); test `score.test.ts:28` | BUILT |
| Expired documents deduct without decay | `DOC_EXPIRED` doc lines (`score.ts:71`); `computeVehicleLedger` (`lib/server/ledger.ts:90`) | BUILT |
| One mapping alert→class | `alertEventClass` (`lib/server/ledger.ts:25`) | BUILT |

## Role access and RLS proof (§7)

| Requirement | Satisfied by | Status |
|---|---|---|
| RTO cannot read raw telemetry (failing query shown) | no RTO telemetry policy (`db/policies.sql:78`); test T1 `db/rls.test.sql:11`; runner `scripts/rls-test.mjs` | BUILT |
| RTO limited to summary/compliance data | `rto_alerts_only` (`policies.sql:83`) + `rto_vehicle_summary` view (`policies.sql:85`); tests T2/T3 | BUILT |
| Parent live-tail only, no history scrape | `parent_live_tail_only` 3-minute window (`policies.sql:64`); test T4 `db/rls.test.sql:62` | BUILT |
| Parent map exists only during an ACTIVE trip | `status = 'ACTIVE'` in parent policy; test T5 `db/rls.test.sql:80` | BUILT |
| School admin scoped to own fleet | `school_own_fleet_*` (`policies.sql:70`); test T6 `db/rls.test.sql:97` | BUILT |
| Enforcement in the DB, not the UI | user-scoped `sessionClient` for privacy reads (`lib/supabase/session.ts`) vs service-role writes (`lib/supabase/server.ts`) | BUILT |

## Evidence, replay, and documents

| Requirement | Satisfied by | Status |
|---|---|---|
| Append-only evidence, never edited | `evidence_records` (`db/schema.sql:218`); `appendEvidence` (`lib/server/evidence.ts:12`) | BUILT |
| Public, no-PII chain verification | `GET /api/evidence/verify`; `/verify/[hash]` (surface, PLAN.md Phase 7) | BUILT (API) / PARTIAL (public page per phase) |
| Replay uses the real ingest path, chipped REPLAY | `/api/replay/start` + same `POST /api/telemetry/batch` with `source:'REPLAY'`; `seed/tracks/*.json` | BUILT (DEMO DATA) |
| Inspection memo prints to A4 with a working verify QR | `/rto/memo/[vehicleId]` (surface, PLAN.md Phase 6) + `stickerPayload`/QR + `/verify/[hash]` | BUILT (chain+QR) / PARTIAL (print page per phase) |
| Vehicle docs never faked as Vahan | `doc_source='MANUAL_ENTRY'` (`db/schema.sql:59`); `DOCUMENT_CHIP` (`lib/adapters/documentSource.ts`) | BUILT |
| School-zone limits (verified) | `school_zones` seam ships empty (`db/schema.sql:294`) | NOT BUILT — PILOT GAP (`verified-speed-segments`) |
| Departmental feeds (Vahan/Sarathi/AIS-140) | `DocumentSourceAdapter` seam (`lib/adapters/documentSource.ts`) | NOT BUILT — PILOT GAP (`departmental-feeds`) |
| Background GPS guarantee | Wake Lock + IndexedDB buffer + heartbeats | PARTIAL (`background-gps`) |
| Kashmiri/Urdu voice | English + Hindi only | NOT BUILT — PILOT GAP (`no-voice`) |
| Auto face blur | manual blur brush blocks upload | PARTIAL (`auto-face-blur`) |

## Definition of Done (§20) → proof

| DoD | Proof |
|---|---|
| 1 No start without bind | test #11; `/api/trip/start` + `/api/trip/bind` |
| 2 No start with failed blocking pre-check | test #12; `app/api/trip/start/route.ts:44` |
| 3 Sustained overspeed → one HIGH alert + evidence | test #1; `reconcileAlerts` evidence append |
| 4 1-second spike → zero alerts | test #2 |
| 5 GPS off = TAMPER vs network drop = COVERAGE_GAP | tests #6/#7; `seed/tracks/route_a_gps_off.json` vs `route_a_network_gap.json` |
| 6 Parent: one bus, ACTIVE only, other bus 403, map locks on end | RLS T4/T5; `parent_active_assigned_trip_only` |
| 7 RTO cannot read raw telemetry (failing query) | RLS T1 (`db/rls.test.sql:11`); `node scripts/rls-test.mjs` |
| 8 Score as a line-by-line ledger with `policy_version` | test #10; `DeductionReceipt.tsx` |
| 9 Mutated evidence row → TAMPERED at correct seq | test #9; `GET /api/evidence/verify` |
| 10 Memo prints A4 with a working verify QR | `stickerPayload` + `/verify/[hash]` + `/rto/memo/[vehicleId]` |

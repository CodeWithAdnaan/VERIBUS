# VERIBUS — Architecture

Runs on the **SEAL** engine — **S**ignal · **E**vidence · **A**lerts · **L**edger.

Tracking is the input. Evidence is the product. This document describes how a raw GPS fix becomes
tamper-evident, explainable evidence, and how the database — not the UI — enforces the privacy
claim. Every component named below points to a file that exists in this repo.

## 1. The pipeline (BUILD SPEC §4)

```
   ┌────────────────────┐
   │  Driver PWA         │  app/driver/**  (Trip Mode; Wake Lock; IndexedDB fix buffer)
   │  GPS Doppler only   │  posts fixes + heartbeats; buffers offline, never drops a fix
   └─────────┬──────────┘
             │  POST /api/telemetry/batch   {trip_id, source:'DEVICE', fixes:[{seq,...}]}
             │  POST /api/telemetry/heartbeat {gps_permission, has_fix, ...}
             ▼
   ┌───────────────────────────────────────────────────────────────────────────┐
   │  INGEST  (app/api/telemetry/batch/route.ts → lib/server/ingest.ts)         │
   │  server_ts = now()  ── the server is the source of truth for time          │
   │                                                                            │
   │   1. Signal Quality   classifyFix()           lib/engine/signal.ts         │
   │        GOOD | DEGRADED | REJECTED                                          │
   │   2. Idempotent insert  upsert onConflict (trip_id, seq), ignoreDuplicates  │
   │   3. Alert Engine   evaluate()  (pure, no I/O)  lib/engine/alerts.ts        │
   │        A1 OVERSPEED  A2 LONG_STOP  A3 ROUTE_DEVIATION  A4 DELAY  A5 SIGNAL   │
   │   4. Reconcile   upsert alerts by identity_key (never duplicate)            │
   │   5. Evidence Ledger   appendEvidence() SHA-256 chain  lib/engine/chain.ts  │
   │   6. Aggregates   distance_m, monitored_seconds, gap_seconds; chain_head    │
   └───────┬───────────────────────────────┬───────────────────────────────────┘
           │ writes (service-role client)   │ append-only
           ▼                                ▼
   ┌───────────────┐  ┌──────────────┐  ┌──────────────────┐  ┌────────────────┐
   │ telemetry     │  │ alerts       │  │ evidence_records │  │ trips          │
   │ (raw fixes)   │  │ (windows)    │  │ (hash chain)     │  │ (chain_head…)  │
   └───────┬───────┘  └──────┬───────┘  └────────┬─────────┘  └───────┬────────┘
           │                 │                   │                    │
           │                 ▼                   ▼                    │
           │         ┌───────────────────────────────────────────────┴──────┐
           │         │  Compliance Ledger  computeVehicleLedger()            │
           │         │  score = 100 − Σ(weight×conf×decay) − docs   score.ts │
           │         └───────────────────────┬──────────────────────────────┘
           │                                 │
           ▼   RLS-scoped reads (session client)   ▼   operational reads (service-role)
   ┌───────────────────────────────────────────────────────────────────────────┐
   │  ROLE VIEWS                                                                 │
   │   Parent  /parent    live tail only, ACTIVE trip only (RLS-enforced)       │
   │   Driver  /driver    own trip                                              │
   │   School  /school    own fleet: board, trip detail, speed-time strip, chain │
   │   RTO     /rto        alerts + rto_vehicle_summary + ledger + memo          │
   │                       (NO raw telemetry — enforced in the DB)              │
   └───────────────────────────────────────────────────────────────────────────┘

   ┌───────────────────────────────────────────────────────────────────────────┐
   │  REPLAY HARNESS  /admin/replay  →  POST /api/replay/start                   │
   │  streams seed/tracks/*.json into the SAME POST /api/telemetry/batch         │
   │  with source:'REPLAY'. It is not a mock. Replay data is chipped REPLAY.     │
   └───────────────────────────────────────────────────────────────────────────┘
```

**The SEAL engine stack** (the four modules inside the ingest box above — this is *diagram 01*):
**S** · Signal Quality (`lib/engine/signal.ts`, step 1) → **E** · Evidence Ledger
(`lib/engine/chain.ts`, step 5) → **A** · Alerts (`lib/engine/alerts.ts`, step 3) → **L** ·
Compliance Ledger (`lib/engine/score.ts`, bottom). The **Trip Integrity Layer** (§9) — QR bind,
pre-check gate, and attendant check-in — is the **front door to SEAL**: nothing enters the pipeline
until those three gates pass (`app/api/trip/{bind,precheck,start}`).

Status: the ingest path, engine, evidence chain, compliance ledger, replay endpoint, and RLS are
**BUILT** and verifiable in this repo. Role UIs are assembled onto these building blocks at the
routes shown (PLAN.md phases 3-8); the routes are the contract.

## 2. Source of truth for time (§4)

Device clocks cannot be trusted for "is the bus out of contact right now". The ingest path stamps
`server_ts = new Date().toISOString()` on every inserted fix (`lib/server/ingest.ts:252`), and the
engine receives `now` as an explicit parameter (`EvaluateInput.now`, `lib/engine/types.ts:136`).

- `device_ts` is used only for **ordering** fixes within a trip.
- `server_ts` is used for the **contact timeline** that decides SIGNAL_LOST
  (`signalLost`, `lib/engine/alerts.ts:347`). A buffered fix carries an old `device_ts` (proof the
  bus was recording) but a late `server_ts` (proof it did not reach us live) — this is exactly why
  the coverage-gap vs tamper distinction works.

## 3. Idempotent ingest (§4, §14)

Telemetry is inserted with `upsert(rows, { onConflict: 'trip_id,seq', ignoreDuplicates: true })`
(`lib/server/ingest.ts:263`), backed by the unique constraint `telemetry (trip_id, seq)`
(`db/schema.sql:202`). A phone that reconnects and re-sends its IndexedDB buffer cannot create
duplicate fixes. Likewise every alert has a stable `identity_key` and a unique constraint
`alerts (trip_id, identity_key)` (`db/schema.sql:248`), so re-evaluating a trip on every batch
updates the existing alert's window fields and never produces a second row
(`reconcileAlerts`, `lib/server/ingest.ts:93`). The whole trip is re-evaluated on each batch — a
pilot-scale choice, called out as a scaling PILOT GAP (`realtime-scale`, `lib/pilotGaps.ts:57`).

## 4. The pure engine (§8)

`lib/engine/*` contains no database calls. `evaluate(input)` (`lib/engine/alerts.ts:521`) is a
deterministic function of its input, which is why the rules are unit-testable without a server
(`tests/engine/**`, 17/17 passing). The ingest path is the only place that loads DB state, calls
the engine, and writes the result back. This separation is what lets the same code evaluate live
`DEVICE` telemetry and `REPLAY` telemetry identically. See `docs/ENGINE.md` for the full rule spec.

## 5. Evidence chain (§10)

`evidence_records` is append-only (`db/schema.sql:218`: "Never UPDATE. Never DELETE"). Each record
stores `prev_hash` and `record_hash = sha256("<trip>|<seq>|<kind>|<canonicalJson(payload)>|<prev>")`
(`lib/engine/chain.ts:40`). The trip row holds the `chain_head` cursor. `appendEvidence`
(`lib/server/evidence.ts:12`) links each new record to the current head and advances it. Any
mutation of a stored payload breaks the recomputed hash; `verifyChain` reports the first broken
seq (`lib/engine/chain.ts:75`), surfaced by `GET /api/evidence/verify?trip_id=`.

## 6. RLS enforcement (§7) — the privacy claim is provable

Row Level Security is enabled on exactly four tables: `trips`, `telemetry`, `alerts`, `students`
(`db/policies.sql:29`). The policies are the entire privacy argument, enforced in Postgres:

- **Parent** sees one trip only when it is `ACTIVE`, on their child's assigned route, and consent
  is granted and not withdrawn — one statement, `parent_active_assigned_trip_only`
  (`db/policies.sql:49`). Parents get the **live tail only**: telemetry with
  `server_ts > now() - interval '3 minutes'` on an ACTIVE trip (`parent_live_tail_only`,
  `db/policies.sql:64`). They cannot scrape history, and the map ceases to exist when the trip
  ends.
- **School admin** is scoped to its own fleet (`school_own_fleet_trips` /
  `school_own_fleet_telemetry`, `db/policies.sql:70`).
- **RTO has no SELECT policy on `telemetry` and none on `trips`.** By absence, an RTO officer reads
  zero raw breadcrumbs and zero trips. RTO reads only `alerts` (`rto_alerts_only`,
  `db/policies.sql:83`) and the aggregate view `rto_vehicle_summary` (`db/policies.sql:85`), which
  exposes counts and document expiries but no location. This is DoD #7, proven by
  `db/rls.test.sql` (T1, T2, T3).
- Helper functions `auth_role()` / `auth_school()` are `security definer` to read `profiles`
  without RLS recursion (`db/policies.sql:16`).

The proof script `db/rls.test.sql` impersonates each role inside a rolled-back transaction and
asserts the forbidden queries return zero rows; run it with `node scripts/rls-test.mjs`.

## 7. Two Supabase clients (service-role vs user-scoped)

The split is deliberate and is the reason RLS can be both enforced and bypassed in the right
places:

- **Service-role client** — `serviceClient()` (`lib/supabase/server.ts`). Bypasses RLS. Used only
  server-side for the ingest path, trip-lifecycle writes, the watchdog, and operational reads that
  perform their own authorization in the route or server component. Never imported into a client
  component.
- **User-scoped SSR client** — `sessionClient()` (`lib/supabase/session.ts`). Carries the logged-in
  user's JWT, so RLS is the enforcer. Used by the privacy-critical reads (parent live view, RTO
  summary). `requireProfile(['role'])` (`lib/server/auth.ts`) guards pages by role.

Writes and operational board reads use the service-role client and authorize explicitly; anything
that touches a child's data on a parent's behalf goes through the user-scoped client so the
database decides what is visible.

## 8. Scheduled work

The watchdog (`app/api/cron/watchdog/route.ts`) re-evaluates every ACTIVE trip (resolving PENDING
signal gaps into COVERAGE_GAP or SIGNAL_TAMPER) and runs the TRIP_NOT_STARTED sweep. In production
it runs on a Vercel cron; in local/dev there is no cron, so it is triggered by a "Run schedule
sweep" button in `/admin`. The logic is identical; only the trigger differs — stated as the
`cron-on-deploy` PILOT GAP (`lib/pilotGaps.ts:39`).

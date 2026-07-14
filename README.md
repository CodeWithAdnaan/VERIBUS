# VERIBUS
### School Transport Integrity Platform · Concept pilot for RTO Kashmir / J&K Transport Department
Runs on the **SEAL** engine — Signal · Evidence · Alerts · Ledger

> Every trip, verified.

Tracking is the input. Evidence is the product. When a school bus overspeeds, the RTO today has no
evidence it can legally act on. This system turns raw GPS telemetry into tamper-evident,
explainable evidence — a SHA-256 hash chain per trip, a line-by-line compliance ledger that shows
its policy version, and a signal model that never punishes a driver for the network yet never lets
one hide behind "bad signal". It also proves, in the database, that it collects the minimum and
never over-reaches on a child's privacy: an RTO officer literally cannot read a raw location fix.

This is a Next.js 15 (App Router, TypeScript strict, React 19, Tailwind v3) pilot for RTO J&K.

## Contents
1. What is built vs. what is not
2. Setup
3. Demo logins
4. Feature register
5. **Limitations (pilot gaps)** — read this before judging scope
6. Tests → §18
7. Definition of Done (§20)
8. RLS proof
9. Where things live
10. Honesty rules

---

## 1. What is built vs. what is not

The evaluation backbone is complete and verifiable in this repo: the pure alert engine
(`lib/engine/`), the ingest path (`app/api/telemetry/batch` → `lib/server/ingest.ts`), the evidence
hash chain (`lib/engine/chain.ts`), the compliance ledger (`lib/engine/score.ts`), the database
schema and RLS (`db/`), the shared components (`components/`), the replay tracks (`seed/tracks/`),
and 17 passing unit tests (`tests/engine/`). Role UIs are assembled onto these building blocks at
the routes named in Section 4 (PLAN.md phases 3-8); routes are the contract. Status labels below
distinguish what is `BUILT`, what runs on `BUILT (DEMO DATA)`, what is `PARTIAL`, and what is
`NOT BUILT — PILOT GAP`.

## 2. Setup

Prerequisites: Node 20+ and a Supabase project (the app has no local Postgres fallback — the live
DB steps need real credentials).

1. Create a Supabase project (Dashboard → new project).
2. Copy the env template and fill it in:
   - `cp .env.example .env.local`
   - Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_DB_URL` from Project Settings → API / Database.
     `BIND_HMAC_PEPPER` and `CRON_SECRET` may stay at their placeholders for a local demo.
     See `.env.example` for exactly which dashboard page each value comes from.
3. `npm install`
4. `npm run db:push` — applies `db/schema.sql` then `db/policies.sql` (`scripts/db-push.mjs`).
5. `npm run db:seed` — loads the backbone, patches route geometry, seeds the roster, and creates
   the Supabase auth users (`scripts/seed.mjs`).
6. `npm test` — runs the engine unit tests. This step is **pure** and needs no credentials.
7. `npm run dev` — starts Next.js on `http://localhost:3000`.

Between demo runs, `npm run demo:reset` wipes only the runtime tables (trips, telemetry, alerts,
evidence, complaints) and preserves the fleet, roster, schedules, and policy
(`scripts/demo-reset.mjs`).

## 3. Demo logins

All demo accounts use the password `Demo@1234` (deliberately weak — pilot only). Defined in
`scripts/seed.mjs:26`.

| Email | Role | Notes |
|---|---|---|
| `rto@demo.gov.in` | rto_officer | summary + alerts + ledger + memo; no raw telemetry |
| `schoolA@demo.gov.in` | school_admin | Valley Public School (School A) |
| `schoolB@demo.gov.in` | school_admin | Dal Lake Convent School (School B) |
| `driver1@demo.gov.in` | driver | Bashir Ahmad, linked to driver record on School A |
| `parent@demo.gov.in` | parent | Aisha; child Zoya on Route A, consent granted |

## 4. Feature register

Status legend: `BUILT` · `BUILT (DEMO DATA)` · `PARTIAL` · `NOT BUILT — PILOT GAP`. Each row links
to the file/route/test that grounds it; "(surface)" marks where a capability is presented in the UI.

| Feature | Status | Grounded in |
|---|---|---|
| Telemetry ingest, idempotent on `(trip_id, seq)` | BUILT | `app/api/telemetry/batch/route.ts`, `lib/server/ingest.ts`, `db/schema.sql:202` |
| Signal quality (GOOD/DEGRADED/REJECTED) | BUILT | `lib/engine/signal.ts`; test `overspeed.test.ts:51` |
| Overspeed (sustained, one alert; disabled until limit+source set) | BUILT | `lib/engine/alerts.ts:66`; tests #1/#2 `overspeed.test.ts:26,:39` |
| Long stop / unexpected stop | BUILT | `lib/engine/alerts.ts:142` |
| Route deviation (LOW on poor GPS) | BUILT | `lib/engine/alerts.ts:193`; test #5 `deviation.test.ts:30` |
| Delay (own history, no external API) | BUILT | `lib/engine/alerts.ts:251` |
| Signal-lost: coverage-gap vs tamper vs pending | BUILT | `lib/engine/alerts.ts:327`; tests #6/#7 `signal.test.ts:11,:37` |
| SOS (press-and-hold, never auto-resolves) | BUILT | `lib/engine/alerts.ts:420`, `app/api/trip/sos/route.ts` |
| Repeat-complaint cluster (only upheld deducts) | BUILT | `lib/engine/alerts.ts:452`, `lib/server/ledger.ts:80` |
| Trip-not-started sweep | BUILT | `lib/engine/alerts.ts:495`, `app/api/cron/watchdog/route.ts` |
| Trip start gate (bind / precheck / attendant 409s) | BUILT | `lib/engine/gate.ts`, `app/api/trip/start/route.ts`; tests #11/#12 |
| Vehicle QR bind (HMAC) + geofence flag | BUILT | `lib/server/bind.ts`, `app/api/trip/bind/route.ts` |
| Evidence SHA-256 hash chain + verify | BUILT | `lib/engine/chain.ts`, `lib/server/evidence.ts`, `GET /api/evidence/verify`; tests #8/#9 |
| Compliance ledger (receipt, with policy_version) | BUILT | `lib/engine/score.ts`, `lib/server/ledger.ts`, `components/charts/DeductionReceipt.tsx`; test #10 |
| Row Level Security (parent live-tail, RTO no telemetry) | BUILT | `db/policies.sql`; `db/rls.test.sql` |
| Replay harness (same ingest endpoint, REPLAY chip) | BUILT (DEMO DATA) | `app/api/replay/start/route.ts`, `seed/tracks/*.json`, `/admin/replay` (surface) |
| Seed fleet / roster / policy (synthetic near Srinagar) | BUILT (DEMO DATA) | `db/seed.sql`, `scripts/seed.mjs`, `seed/routes/*.geojson` |
| Driver PWA Trip Mode | PARTIAL | `/driver` (surface, PLAN.md Phase 3); background GPS gap below |
| Parent live view / consent / complaint | PARTIAL | `/parent` (surface, PLAN.md Phase 4); auto face-blur gap below |
| School board / trip detail / speed-time strip / chain | PARTIAL | `/school` (surface, PLAN.md Phase 5); `components/charts/{SpeedTimeStrip,EvidenceChain}.tsx` exist |
| RTO policy / vehicle ledger / inspections / memo | PARTIAL | `/rto/*` (surface, PLAN.md Phase 6); ledger + QR + verify are BUILT |
| Public no-PII verify page | PARTIAL | `/verify/[hash]` (surface, PLAN.md Phase 7); verify API is BUILT |
| Background GPS guarantee | PARTIAL | `background-gps` — `lib/pilotGaps.ts:14` |
| School-zone / per-road verified limits | NOT BUILT — PILOT GAP | `verified-speed-segments`; `school_zones` seam empty `db/schema.sql:294` |
| Departmental feeds (Vahan/Sarathi/AIS-140) | NOT BUILT — PILOT GAP | `departmental-feeds`; seam `lib/adapters/documentSource.ts` |
| Kashmiri/Urdu voice | NOT BUILT — PILOT GAP (deliberate) | `no-voice`, `lib/pilotGaps.ts:44` |
| AI complaint classifier / NL query | NOT BUILT — PILOT GAP | §19 cut list; dropdown + inspection queue are the guaranteed paths |

## 5. Limitations (pilot gaps)

Read this before judging scope. The system names its own limits as a feature. All eight gaps are
defined in `lib/pilotGaps.ts` (the `PILOT_GAPS` array), aggregated at `/limitations`, and expanded
with build-vs-not detail in `docs/LIMITATIONS.md`:

- `background-gps` — PARTIAL: no guaranteed background tracking without a native wrapper; the gap is
  made visible (coverage-gap vs tamper) rather than hidden.
- `departmental-feeds` — NOT BUILT — PILOT GAP: vehicle docs are manual entry; the adapter seam
  exists, no Vahan/Sarathi/AIS-140 integration is built or implied.
- `verified-speed-segments` — NOT BUILT — PILOT GAP: overspeed uses one operator-set limit; the
  `school_zones` table ships empty.
- `qr-photographable` — PARTIAL: the bind proves the driver saw the sticker; it is not unspoofable.
- `cron-on-deploy` — PARTIAL: sweeps run on a Vercel cron in production, and via an admin button in
  dev.
- `no-voice` — NOT BUILT — PILOT GAP (deliberate): no Kashmiri/Urdu TTS; stated plainly, not faked.
- `auto-face-blur` — PARTIAL: manual blur brush is the guaranteed path and blocks upload.
- `realtime-scale` — PARTIAL: pilot-scale realtime and a manual retention purge.

DPDP is honoured in substance (verifiable parental consent, revocable via RLS); exact statutory
section numbers are left to counsel and are not invented here.

## 6. Tests → §18

`npm test` runs Vitest (`vitest.config.ts`) over `tests/engine/**`. There are **17** `it()` cases
across 6 files, all passing (**17/17**), with no database or credentials required. Twelve are the
numbered §18 acceptance tests; the full index (all 12 + the 5 supporting cases) is in
`docs/ENGINE.md` Section 7. Summary:

| # | What it proves | File |
|---|---|---|
| 1-4 | overspeed: one alert / ignore spike / exclude poor accuracy / no derived speed | `tests/engine/overspeed.test.ts` |
| 5 | deviation forced to LOW on poor accuracy | `tests/engine/deviation.test.ts` |
| 6-7 | coverage-gap (deduction 0) vs tamper (full deduction) | `tests/engine/signal.test.ts` |
| 8-9 | clean chain verifies / mutation caught at exact seq | `tests/engine/chain.test.ts` |
| 10 | score reproducible regardless of order | `tests/engine/score.test.ts` |
| 11-12 | start gate 409 BIND_REQUIRED / PRECHECK_FAILED | `tests/engine/gate.test.ts` |

## 7. Definition of Done (§20)

The demo must pass all ten, live. Full proof map in `docs/TRACEABILITY.md`; step-by-step click path
in `DEMO.md`.

- [ ] 1. No trip start without QR bind.
- [ ] 2. No trip start with a failed blocking pre-check.
- [ ] 3. Sustained overspeed → exactly one HIGH-confidence alert + evidence packet.
- [ ] 4. 1-second GPS spike → zero alerts.
- [ ] 5. GPS killed → SIGNAL_TAMPER; network drop with backfill → COVERAGE_GAP (zero deduction);
      the two look completely different.
- [ ] 6. Parent sees one bus, ACTIVE only; other bus → 403; map locks on trip end.
- [ ] 7. RTO cannot read raw telemetry (failing query shown).
- [ ] 8. Score renders as a line-by-line ledger with its `policy_version`.
- [ ] 9. Mutated evidence row → `/api/evidence/verify` reports TAMPERED at the correct seq.
- [ ] 10. Inspection memo prints to A4 with a working verification QR.

## 8. RLS proof

The privacy claim is enforced in Postgres, not the UI. `db/rls.test.sql` impersonates each role
inside a rolled-back transaction and asserts the forbidden queries return zero rows. Run it after
seeding:

```
node scripts/rls-test.mjs
```

(There is no `npm run rls:test` alias; the runner is `scripts/rls-test.mjs`, or paste
`db/rls.test.sql` into the Supabase SQL editor.) It checks six things, including DoD #7 — an RTO
officer reads 0 telemetry rows (`db/rls.test.sql:11`) and 0 trips, but the `rto_vehicle_summary`
view is visible. Like every live DB step, it needs Supabase credentials in `.env.local`.

## 9. Where things live

- `lib/engine/` — the pure engine (alerts, signal, score, chain, gate, geo, policy, types).
- `lib/server/` — DB-touching glue (ingest, evidence, ledger, bind, auth, policy, trace).
- `lib/supabase/` — `server.ts` (service-role, bypasses RLS) and `session.ts` (user-scoped, RLS).
- `app/api/` — the API routes (telemetry, trip lifecycle, evidence verify, replay, cron).
- `db/` — `schema.sql`, `policies.sql` (RLS), `rls.test.sql`, `seed.sql`.
- `components/` — shared UI (`ui/`, `charts/`, `map/`, `shell/`).
- `tests/engine/` — the 17 unit tests.
- `seed/` — synthetic routes and the 5 replay tracks.
- Docs: `ARCHITECTURE.md`, `DEMO.md`, `docs/ENGINE.md`, `docs/LIMITATIONS.md`,
  `docs/TRACEABILITY.md`, `PLAN.md`.

## 10. Honesty rules

Enforced throughout (PLAN.md honesty constraints, BUILD SPEC §2): no hardcoded speed limit
(overspeed is disabled until an operator sets a limit and cites a source); speed only from GPS
Doppler; no faked departmental integrations; delay from this system's own history, not an external
API; replay is never hidden and posts to the real ingest endpoint; every pilot gap is stated out
loud; no invented statistics, accuracy percentages, or legal section numbers.

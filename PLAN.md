# PLAN.md — Build Plan

> Written before any application code, per BUILD SPEC §0.1. This restates the §19 phases
> with a file-level breakdown. The engine comes before the UI. That order is non-negotiable.

## Thesis (every file serves this)

> **Tracking is the input. Evidence is the product.**
> When a school bus overspeeds, the RTO has no evidence it can legally act on. This system
> turns raw GPS telemetry into tamper-evident, explainable evidence — and proves, in the
> database, that it collects the minimum and never over-reaches on a child's privacy.

## Honesty constraints (BUILD SPEC §2 — treated as acceptance criteria, not suggestions)

- No hardcoded speed limit. `policy_config.rules.speed.default_limit_kmh` starts `null`;
  overspeed evaluation is **disabled** until an operator sets the limit **and** cites a
  source on `/rto/policy`.
- Speed comes **only** from `GeolocationCoordinates.speed` (GPS Doppler). Never distance÷time.
  Never the accelerometer.
- No faked Vahan / Sarathi / AIS-140. Vehicle docs are `MANUAL_ENTRY`. A `DocumentSourceAdapter`
  interface + `ManualAdapter` provide the real integration seam without faking it.
- No external traffic/weather API. Delay uses the historical median of our own completed trips.
- No new hardware. A printed QR sticker is paper (allowed).
- No chatbot. No public live map.
- No invented statistics, accuracy percentages, dataset citations, or legal section numbers.
- No fabricated coordinates — synthetic route geometry is labelled SYNTHETIC.
- `<PilotGap>` states real gaps out loud; `/limitations` aggregates them as a feature.
- Replay is never hidden — it posts to the same ingest endpoint and is chipped `REPLAY`.

## Status labels used throughout docs

`BUILT` · `BUILT (DEMO DATA)` · `PARTIAL` · `NOT BUILT — PILOT GAP`

---

## Phase 0 — Repo, schema, RLS, roles, auth, seed

| File | Purpose |
|---|---|
| `package.json`, `tsconfig.json` (strict), `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `vitest.config.ts` | Toolchain |
| `design/tokens.css`, `app/globals.css`, `app/layout.tsx` | Design tokens + self-hosted IBM Plex + Noto Sans Devanagari fonts |
| `db/schema.sql` | All tables/enums/views (§5) |
| `db/policies.sql` | RLS (§7): the single parent privacy policy, parent live-tail-only telemetry, **no RTO telemetry SELECT policy**, `rto_vehicle_summary` view |
| `db/rls.test.sql` | Asserts forbidden queries return 0 rows / error (demo asset, proves DoD #7) |
| `db/seed.sql`, `scripts/seed.mjs` | Seed data (§17) + Supabase auth users |
| `scripts/db-push.mjs`, `scripts/demo-reset.mjs` | Migrations via `pg` (no CLI/Docker needed) |
| `seed/routes/*.geojson` | SYNTHETIC placeholder geometry near Srinagar |

## Phase 1 — Telemetry ingest + Signal Quality + Evidence chain + Replay harness

| File | Purpose |
|---|---|
| `lib/engine/chain.ts` | `canonicalJson`, `genesis`, `recordHash`, `verifyChain` (SHA-256) |
| `lib/engine/signal.ts` | `classifyFix → GOOD \| DEGRADED \| REJECTED` |
| `lib/zod/schemas.ts` | Every API boundary |
| `lib/supabase/{browser,server,session}.ts` | Clients (server = service-role) |
| `app/api/telemetry/batch/route.ts` | Ingest: validate → signal quality → idempotent insert → aggregates → alert engine → reconcile → evidence → chain_head |
| `app/api/telemetry/heartbeat/route.ts` | Heartbeat incl. `gps_permission` |
| `app/admin/replay/page.tsx` | Playback 1×/5×/20×, injectors, posts to the **same** batch endpoint with `source:'REPLAY'` |
| `seed/tracks/*.json` | 5 replay tracks |

## Phase 2 — Alert engine + all 12 unit tests green

| File | Purpose |
|---|---|
| `lib/engine/types.ts` | `Fix`, `Heartbeat`, `AlertEvent` (stable identity key), `PolicyRules`, `DeductionLedger` |
| `lib/engine/geo.ts` | turf wrappers |
| `lib/engine/alerts.ts` | Pure `evaluate(...)` — A1 OVERSPEED, A2 LONG_STOP, A3 ROUTE_DEVIATION, A4 DELAY, A5 SIGNAL_LOST, A6 SOS, A7 REPEAT_COMPLAINT, A0 TRIP_NOT_STARTED. Zero magic numbers. |
| `lib/engine/reconcile.ts` | `AlertEvent[]` → upsert alerts by identity (never duplicate) |
| `lib/engine/gate.ts` | Pure `evaluateStartGate(...)` |
| `lib/engine/score.ts` | Pure `computeScore(...) → DeductionLedger` (deterministic) |
| `app/api/cron/watchdog/route.ts` | Signal-lost reclassify + TRIP_NOT_STARTED sweep |
| `tests/engine/*.test.ts` | The 12 tests (§18) |

## Phase 3 — Driver PWA: bind → precheck gate → Trip Mode

| File | Purpose |
|---|---|
| `app/api/trip/{bind,start,end,sos}/route.ts` | HMAC bind, gated start (409s), end, SOS |
| `app/driver/**` | Today's trips, bind, precheck gate, Trip Mode |
| `lib/offline/buffer.ts` | IndexedDB fix buffer (`idb`) — never drops a fix |
| `app/manifest.webmanifest` | Installable PWA |

## Phase 4 — Parent (RLS-locked) + complaint + consent/withdraw

| File | Purpose |
|---|---|
| `app/parent/**` | One ACTIVE bus, live-tail-only; 403 on other bus; map locks on trip end |
| `app/parent/consent/**` | Grant / view / **withdraw** (revokes access) |
| `app/parent/complaint/**` | Manual face-blur brush is the guaranteed path; upload blocked until blurred |

## Phase 5 — School: live board, trip detail, speed-time strip, evidence chain

| File | Purpose |
|---|---|
| `app/school/**` | Live board, alerts triage, fleet, complaints |
| `app/school/trip/[id]/**` | Map + **★ speed-time strip** + evidence chain |
| `components/charts/SpeedTimeStrip.tsx` | The hero graphic (hand-built SVG + signal quality lane) |
| `components/charts/EvidenceChain.tsx` | Chain view; broken link → hazard band + TAMPERED |
| `components/map/{MapCanvas,TripTrace}.tsx` | Leaflet, colour-coded trace, dashed "Unmonitored" gap |

## Phase 6 — RTO: deduction ledger, inspection queue, memo + print, policy

| File | Purpose |
|---|---|
| `app/rto/policy/**` | Set limit + cite source; edit + version weights; the deduction-argument copy |
| `app/rto/vehicle/[id]/**` | Deduction ledger receipt + evidence links + "why #N in queue" |
| `app/rto/inspections/**` | Priority table (worst-first) |
| `app/rto/memo/[vehicleId]/**` | A4 print memo, DRAFT watermark, verify QR |
| `components/charts/DeductionReceipt.tsx`, `FleetStrip.tsx` | Receipt + worst-first strip |

## Phase 7 — Evidence verify + tamper demo

| File | Purpose |
|---|---|
| `app/api/evidence/verify/route.ts` | Recompute chain → `{valid, broken_at_seq, ...}` |
| `app/verify/[hash]/page.tsx` | Public, no-PII chain verification |
| `app/admin/tamper/page.tsx` | DEV-ONLY, hazard-banded, mutates one payload to demo detection |

## Phase 8 — Design pass, `<PilotGap>`, `/limitations`, core docs

| File | Purpose |
|---|---|
| `components/ui/PilotGap.tsx`, `app/limitations/page.tsx` | Every gap, aggregated as a feature |
| `app/admin/retention/page.tsx` | Run purge, show rows deleted |
| `README.md`, `ARCHITECTURE.md`, `DEMO.md`, `docs/{ENGINE,LIMITATIONS,TRACEABILITY}.md` | Core docs |

---

## Build order rule (§19)

Implement phase by phase in the order above. After each phase, run its tests and report
pass/fail. Do not silently skip. If a requirement is impossible, stop and say so (§0.4).

## Cut list (§19, in this exact order if behind)

`/rto/ask` NL query → AI complaint classifier (dropdown fallback stays) → auto face blur
(manual brush stays) → weekly report PDF → attendant check-in → DELAY alert.

## Never cut (§19)

Evidence chain + verify · SIGNAL_LOST gap-vs-tamper · pre-check gate · parent RLS · replay
harness · deduction ledger · inspection memo.

## Definition of done (§20) — the demo must pass all 10, live

1. No trip start without QR bind. 2. No trip start with a failed blocking pre-check.
3. Sustained overspeed → exactly one HIGH-confidence alert + evidence packet. 4. 1-second
GPS spike → zero alerts. 5. GPS killed → SIGNAL_TAMPER; network drop with backfill →
COVERAGE_GAP (zero deduction); the two look completely different. 6. Parent sees one bus,
ACTIVE only; other bus → 403; map locks on trip end. 7. RTO cannot read raw telemetry
(failing query shown). 8. Score renders as a line-by-line ledger with its `policy_version`.
9. Mutated evidence row → `/api/evidence/verify` reports TAMPERED at the correct seq +
hazard band. 10. Inspection memo prints to A4 with a working verification QR.

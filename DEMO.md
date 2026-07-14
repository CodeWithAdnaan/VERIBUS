# VERIBUS — Demo run sheet (5 minutes)

This proves all ten Definition-of-Done points (§20) live, in order, using the replay harness so no
phone is required. Every step names the route and the code/test behind it. Keep two browser
profiles open (one signed in as RTO, one as the parent) to avoid re-login.

## Before you start

- Complete the setup in `README.md` (env, `npm run db:push`, `npm run db:seed`, `npm run dev`).
- Demo logins (password `Demo@1234`, from `scripts/seed.mjs`):
  `rto@demo.gov.in`, `schoolA@demo.gov.in`, `schoolB@demo.gov.in`, `driver1@demo.gov.in`,
  `parent@demo.gov.in`.
- Reset between rehearsals with `npm run demo:reset` (wipes runtime tables only; keeps fleet,
  roster, schedules, policy — `scripts/demo-reset.mjs`).
- Stable demo IDs: School A `0a5c0001-…-01`, Route A `0a0c0001-…-a1`, Vehicle BUS-05
  `0e100005-…-05`. The parent's child (Zoya) is on Route A.

## The click path

### Step 0 — Policy screen (sets the stage, proves the honesty banner)
Sign in as `rto@demo.gov.in` → open `/rto/policy`.
- The active config is `RTO_JK_v1` (`db/seed.sql:100`). The speed limit is 40 km/h but its source
  reads "DEMO VALUE — …", so the screen shows an **amber** banner: the system does not assert a
  legal limit on its own authority (`speedPolicyBanner`, `lib/engine/policy.ts:25`). Leave it as-is
  for the demo; note that overspeed evaluation is only enabled because a limit is set.

### Step 1 — Start the clean replay (proves nothing is invented between trips)
Open `/admin/replay`. Pick Route A + BUS-05, load `route_a_clean`, press Play.
- This calls `POST /api/replay/start` to create an ACTIVE demo trip, then streams the track into the
  **same** `POST /api/telemetry/batch` the real phone uses, with `source:'REPLAY'`
  (`app/api/replay/start/route.ts`, `gen-tracks.mjs`). The trip carries a `REPLAY` chip everywhere.
- Open `/school` as `schoolA@demo.gov.in`: the bus appears on the live board. Speed sits near
  30 km/h; no alerts. This is the quiet baseline — colour means something is wrong, and nothing is.

### Step 2 — Overspeed → exactly one HIGH alert (DoD #3 and #4)
Back in `/admin/replay`, load `route_a_overspeed` and play.
- The track holds 60 km/h from t=100-150 s (`gen-tracks.mjs:74`), over the 40+5 limit. The engine
  raises **one** HIGH-confidence OVERSPEED alert for the whole sustained window, not one per fix
  (`overspeed`, `lib/engine/alerts.ts:66`; test #1). By contrast a single 1-second spike raises
  **zero** alerts (test #2) — that is DoD #4.
- Open `/school/trip/[id]` for this trip: the speed-time strip
  (`components/charts/SpeedTimeStrip.tsx`) shows the violation window with the signal-quality lane;
  the alert links to its evidence record (DoD #3).

### Step 3 — GPS off = TAMPER vs network drop = COVERAGE_GAP (DoD #5)
Run these two tracks and compare — they must look completely different.
- Load `route_a_gps_off` (nothing recorded 60-200 s, nothing buffered, `gen-tracks.mjs:82`). On
  resume there is no recovered data → **SIGNAL_TAMPER**, CRITICAL, full deduction
  (`signalLost`, `lib/engine/alerts.ts:403`; test #7). In the trace it shows as a hazard-banded gap.
- `npm run demo:reset` if you want a clean board, then load `route_a_network_gap` (device keeps
  recording 60-200 s, buffered, backfills on reconnect, `gen-tracks.mjs:87`). This is a
  **COVERAGE_GAP**, INFO, deduction 0 — a driver is never punished for Kashmir's network
  (`alerts.ts:384`; test #6). Same-length blackout, opposite verdict.
- The alternative trigger for tamper — GPS permission denied mid-trip — is an immediate tamper
  (`alerts.ts:337`) if you want to show it via a heartbeat.

### Step 4 — SOS (press-and-hold, never auto-resolves)
While a replay trip is ACTIVE, trigger `POST /api/trip/sos` (the driver Trip Mode SOS at `/driver`,
or the endpoint directly).
- One CRITICAL alert is created from the last known GOOD fix, with `never_auto_resolves = true`
  (`sosEvent`, `lib/engine/alerts.ts:420`; `app/api/trip/sos/route.ts`). On the school board it must
  be cleared by an explicit acknowledgement with a written note — it does not clear itself.

### Step 5 — Start gate (DoD #1 and #2)
Sign in as `driver1@demo.gov.in` → `/driver`, open today's Route A trip.
- Try to start **without scanning** the in-bus QR: `POST /api/trip/start` returns
  `409 BIND_REQUIRED` (`lib/engine/gate.ts:36`; test #11). Scan the sticker to satisfy the HMAC
  bind (`/api/trip/bind`, `lib/server/bind.ts`); a bind far from any route stop is flagged.
- In the pre-check, mark a **blocking** item (e.g. DOORS) as failed and try to start: `409
  PRECHECK_FAILED` (`gate.ts:46`; test #12). A checklist that cannot block anything is decoration.

### Step 6 — Parent sees one bus, ACTIVE only (DoD #6)
Sign in as `parent@demo.gov.in` → `/parent` while a Route A replay trip is ACTIVE.
- The parent sees exactly one live bus (their child's), because
  `parent_active_assigned_trip_only` requires ACTIVE + assigned route + granted consent
  (`db/policies.sql:49`). Location is the live tail only — telemetry newer than 3 minutes
  (`parent_live_tail_only`, `db/policies.sql:64`).
- Try to open another bus's trip → 403 (no policy grants it). End the trip (or `demo:reset`): the
  map has nothing to show, because a non-ACTIVE trip is invisible to the parent (RLS test T5,
  `db/rls.test.sql:80`).

### Step 7 — RTO cannot read raw telemetry (DoD #7)
Run the failing query, in a terminal:

```
node scripts/rls-test.mjs
```

- Assertion T1 logs `PASS/T1: rto_officer reads 0 telemetry rows` — there is no RTO SELECT policy on
  `telemetry` at all (`db/policies.sql:78`; `db/rls.test.sql:11`). T2 shows 0 trips; T3 shows the
  `rto_vehicle_summary` view is visible. (Or paste `db/rls.test.sql` into the Supabase SQL editor.)
- As `rto@demo.gov.in`, the RTO screens only ever show aggregated alerts and the summary — never a
  breadcrumb. This is the concept note's "RTO limited to summary/compliance data", enforced in the
  database.

### Step 8 — Compliance ledger with policy_version (DoD #8)
As RTO, open `/rto/vehicle/[id]` for BUS-05.
- The score renders as a line-by-line receipt (`DeductionReceipt.tsx`), each line showing the raw
  weight, confidence multiplier, decay, and applied amount, with the `policy_version` on the ledger
  (`computeVehicleLedger`, `lib/server/ledger.ts:57`; `computeScore`, `lib/engine/score.ts`). Same
  events + same policy → identical ledger (test #10). It is never a donut.

### Step 9 — Tamper tool → verify reports TAMPERED at the exact seq (DoD #9)
Open `/admin/tamper` (DEV-ONLY, hazard-banded). Mutate one evidence payload for a completed trip.
- Then call `GET /api/evidence/verify?trip_id=…` (the trip detail's verify action). It recomputes
  the chain from genesis and reports `valid:false` with `broken_at_seq` at the mutated record
  (`verifyChain`, `lib/engine/chain.ts:75`; test #9). The evidence-chain view shows a hazard band at
  the broken link and a TAMPERED marker.

### Step 10 — Inspection memo prints to A4 with a working QR (DoD #10)
As RTO, open `/rto/memo/[vehicleId]` and print (A4, serif memo, DRAFT watermark).
- The memo carries a verification QR built from `stickerPayload` / the chain hash. Scanning it opens
  the public, no-PII `/verify/[hash]` page, which confirms the chain independently. This closes the
  loop: the evidence a memo cites can be verified by anyone holding the paper, without exposing a
  child's data.

## Reset and repeat

`npm run demo:reset` between runs. The fleet, roster, schedules, and policy persist, so you can
immediately start Step 1 again. If you ever need to rebuild the roster and auth users, run
`npm run db:seed`.

## Notes for the demo

- The `REPLAY` chip stays on every replayed trip — replay is never hidden.
- Every document field shows "Manually entered — pending departmental verification"; there is no
  faked Vahan/Sarathi/AIS-140 integration (`lib/adapters/documentSource.ts`).
- If overspeed does not fire, check `/rto/policy`: with no limit set at all, overspeed evaluation is
  disabled by design and the banner says so (`lib/engine/policy.ts:25`).

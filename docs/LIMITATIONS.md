# VERIBUS — Limitations

A system that names its own limits is the one a department can trust. This file expands every
entry in `lib/pilotGaps.ts` (the `PILOT_GAPS` array, aggregated in the product at `/limitations`
and shown inline via `<PilotGap id="...">`, `components/ui/PilotGap.tsx`). Each entry states what
is built, what is not, and where it surfaces, with a status label.

Status labels: `BUILT` · `BUILT (DEMO DATA)` · `PARTIAL` · `NOT BUILT — PILOT GAP`.

---

## 1. Native background location — `background-gps` — PARTIAL
- **Built:** the driver PWA holds a Wake Lock and buffers fixes to IndexedDB so nothing is dropped
  offline; heartbeats report `gps_permission` so the server can tell coverage loss from tampering
  (`lib/engine/alerts.ts:337`, `signalLost`).
- **Not built:** guaranteed tracking while the app is backgrounded or the screen is off. Mobile
  browsers throttle or suspend GPS; a native wrapper or an Android foreground-service build is
  needed. Surfaces at: Driver Trip Mode (`/driver`). Source: `lib/pilotGaps.ts:14`.
- **Honest posture:** the gap is made *visible* (coverage-gap vs tamper), never hidden.

## 2. Departmental data feeds (Vahan / Sarathi / AIS-140) — `departmental-feeds` — NOT BUILT — PILOT GAP
- **Built:** the integration seam. `DocumentSourceAdapter` + `ManualAdapter`
  (`lib/adapters/documentSource.ts`) define where a verified feed would slot in. Every vehicle row
  is `doc_source = 'MANUAL_ENTRY'` (`db/schema.sql:59`), and every document field carries the chip
  `DOCUMENT_CHIP` = "Manually entered — pending departmental verification".
- **Not built / not implied:** any live Vahan, Sarathi, or AIS-140 integration. `fetchDocs()`
  returns `null` — manual entry is the source of truth in the pilot. Surfaces at: fleet documents,
  inspection memo. Source: `lib/pilotGaps.ts:20`.

## 3. Verified per-road / school-zone speed limits — `verified-speed-segments` — NOT BUILT — PILOT GAP
- **Built:** overspeed against a single operator-set limit and its cited source
  (`overspeed`, `lib/engine/alerts.ts:66`); the `school_zones` table exists as the seam and ships
  **empty** (`db/schema.sql:294`); the policy carries `school_zone_limit_kmh` (25 in
  `RTO_JK_v1`).
- **Not built:** verified per-road / per-zone limit segments — these need a departmental dataset we
  do not have. Until it exists, the default limit applies and the system never asserts a zone limit
  on its own authority. Surfaces at: policy screen (`/rto/policy`), overspeed alerts. Source:
  `lib/pilotGaps.ts:26`.

## 4. The in-bus QR sticker can be photographed — `qr-photographable` — PARTIAL
- **Built:** HMAC bind (`stickerPayload`/`verifyStickerToken`, `lib/server/bind.ts`) proves the
  driver saw the sticker and kills "phone left at school" and "wrong vehicle"
  (`/api/trip/bind` returns `409 WRONG_VEHICLE` / `BIND_INVALID`). Bind location is logged and
  geofenced: a bind more than 2 km from any route stop is flagged `outside_known_geofence`
  (`app/api/trip/bind/route.ts:41`) and written into the evidence record.
- **Not built / not claimed:** an unspoofable sticker. It can be copied. Mitigation is rotation
  (`bind_secret_rotated_at`, `db/schema.sql:56`) + the geofence flag. Surfaces at: driver bind
  (`/driver`). Source: `lib/pilotGaps.ts:32`.

## 5. Scheduled sweeps run only on deploy — `cron-on-deploy` — PARTIAL
- **Built:** the sweep logic itself — signal re-evaluation + TRIP_NOT_STARTED
  (`app/api/cron/watchdog/route.ts`, `tripNotStarted` at `lib/engine/alerts.ts:495`).
- **Not built for local/dev:** an actual scheduler. In production it runs on a Vercel cron; locally
  it is triggered by the "Run schedule sweep" button in `/admin`. The logic is identical; only the
  trigger differs. Surfaces at: admin, TRIP_NOT_STARTED. Source: `lib/pilotGaps.ts:39`.

## 6. No Kashmiri / Urdu voice output — `no-voice` — NOT BUILT — PILOT GAP (deliberate)
- **Built:** UI in English + Hindi (Devanagari), with self-hosted Noto Sans Devanagari
  (`app/layout.tsx`, PLAN.md Phase 0).
- **Deliberately not built:** Kashmiri or Urdu text-to-speech. Usable voices do not exist and a
  broken voice feature would undermine trust, so it is stated plainly rather than faked. Surfaces
  at: internationalisation. Source: `lib/pilotGaps.ts:44`.

## 7. Automatic face blur is not the guaranteed path — `auto-face-blur` — PARTIAL
- **Built (guaranteed path):** a manual blur brush that **blocks** complaint-photo upload until the
  user confirms faces are blurred (PLAN.md Phase 4, `app/parent/complaint/**`; faces are blurred
  client-side before the photo reaches storage, `db/schema.sql:264`).
- **Not built as the guaranteed path:** automatic face detection. It is at most an optional
  enhancement; the system never ships an auto-blur it cannot guarantee. Surfaces at: parent
  complaint. Source: `lib/pilotGaps.ts:50`.

## 8. Realtime + retention are pilot-scale — `realtime-scale` — PARTIAL
- **Built:** live updates and a whole-trip re-evaluation on each batch (`lib/server/ingest.ts`);
  a retention purge that records what it deleted (`retention_runs`, `db/schema.sql:281`;
  `/admin/retention`, PLAN.md Phase 8); retention windows in policy (`raw_telemetry_days` 30,
  `evidence_days` 365).
- **Not built:** tuning for thousands of concurrent buses, and a hardened data-lifecycle job (the
  purge is manual/scheduled, not yet automated). Surfaces at: ingest, retention. Source:
  `lib/pilotGaps.ts:57`.

---

## The two AI places (and only two)

AI is confined to two assistive, human-confirmed places. It never auto-acts and always has a
non-AI fallback. There is **no chatbot** and **no public live map** (PLAN.md honesty constraints).

1. **Complaint category suggestion — PARTIAL / assistive only.** A complaint can carry
   `ai_suggested_category` and `ai_confidence`, shown as "AI-suggested — pending review"; the
   human-confirmed field is `category` (`db/schema.sql:260`). The dropdown is the guaranteed path;
   the suggestion never sets the category on its own, and only an **upheld** complaint deducts
   score (`computeVehicleLedger`, `lib/server/ledger.ts:80`). The classifier itself is on the §19
   cut list (dropdown fallback stays), so treat the model as **NOT BUILT — PILOT GAP** and the
   suggestion field/flow as **PARTIAL**.
2. **RTO natural-language query (`/rto/ask`) — NOT BUILT — PILOT GAP.** First item on the §19 cut
   list; the structured inspection queue (`/rto/inspections`, worst-first) is the guaranteed path.
   If present it only turns a question into a filter over data the RTO may already see under RLS;
   it never widens access.

Both places obey the same rule: AI assists, a human decides, and nothing the AI produces is
presented as verified fact or is allowed to deduct a score by itself.

## Legal note (DPDP)

Children's data is consent-gated in substance: `consents` records `granted_at` / `withdrawn_at`
per guardian-student, and withdrawal revokes access through the parent RLS policy
(`db/policies.sql:49`, join on `consents … granted_at is not null and withdrawn_at is null`). The
exact statutory section references are to be confirmed by counsel before any real deployment; no
section numbers are invented here.

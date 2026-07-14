# VERIBUS — Decisions (ADRs)

Architecture decision records. Each states the decision, the rejected alternative, and why. Every
claim points to a file that exists in this repo.

---

## ADR #1 — Evidence is the product, not tracking

**Decision.** VERIBUS is not a bus-tracking app. The deliverable is *actionable, tamper-evident
evidence* an RTO can act on, produced by the SEAL stack (Signal → Evidence → Alerts → Ledger).

**Rejected alternative.** A live-map tracking product. Tracking a bus is already solved; it does not
give the department something it can issue an order on, and a public live map is an explicit safety
risk. There is deliberately **no public live map** (see the landing page safeguards and
`app/parent/page.tsx`, which shows one bus, live-tail only).

**Status.** BUILT.

---

## ADR #2 — Speed comes only from GPS Doppler

**Decision.** Speed is read solely from `GeolocationCoordinates.speed` (`speed_mps`). A `null` value
makes a fix unusable for speed evaluation; it is never a violation.

**Rejected alternative.** Deriving speed from distance ÷ time between fixes, or from the
accelerometer. Both are unreliable and would manufacture violations from GPS noise. The engine never
computes speed from position — pinned by test #4 (`tests/engine/overspeed.test.ts`) and enforced in
`lib/engine/signal.ts` (GOOD requires a non-null `speed_mps`).

**Status.** BUILT.

---

## ADR #3 — A tamper-evident hash chain, NOT a blockchain

**Decision.** Evidence integrity uses a per-trip **SHA-256 hash chain**: each `evidence_records` row
stores `prev_hash` and `record_hash = sha256("<trip>|<seq>|<kind>|<canonicalJson(payload)>|<prev>")`
(`lib/engine/chain.ts`), with the trip's `chain_head` as the cursor. Any mutation of a stored payload
breaks the recomputed chain, and `verifyChain` reports the first broken seq
(`GET /api/evidence/verify`, public page `/verify/[hash]`).

**Rejected alternative.** A blockchain. This is **not** a blockchain and is never described as one in
the code, UI, or docs. A blockchain is a *distributed* consensus system for a *trustless* network of
mutually-distrusting writers. VERIBUS has a single trusted writer (the ingest path) and one verifier
(the department). It needs tamper-*evidence*, not distributed consensus — so it uses a plain,
auditable, dependency-free hash chain. No mining, no tokens, no peers, no chain reorg. Anyone can
recompute it from the records with a SHA-256 implementation.

**Status.** BUILT. Language is kept consistent everywhere: "tamper-evident hash chain".

---

## ADR #4 — Rules for anything an officer acts on; AI only where rules genuinely fail

**Decision.** Every alert, score, and inspection input is a deterministic rule
(`lib/engine/alerts.ts`, `score.ts`, all thresholds from `policy_config`). AI is restricted to
exactly two advisory places (BUILD SPEC §13): complaint-category triage and an RTO natural-language
filter that outputs only a strict JSON filter object — never SQL, never the answer, never an
auto-action.

**Rejected alternative.** An ML risk model scoring vehicles. An inspection order cannot be issued on
a score nobody can explain; a rulebook is reproducible from `(events, policy_version)` — pinned by
test #10. The name carries no "AI" branding, deliberately: *AI is used only where rules genuinely
fail.*

**Status.** BUILT (rules) · the two AI seams are stubbed / deferred (see `docs/LIMITATIONS.md`).

---

## ADR #5 — Privacy is enforced in the database (RLS), not the UI

**Decision.** Row Level Security on `trips`, `telemetry`, `alerts`, `students` is the privacy
enforcer (`db/policies.sql`). Privacy-critical reads use a user-scoped client so RLS applies;
ingest/operational writes use the service-role client and authorize explicitly
(`lib/supabase/{session,server}.ts`).

**Rejected alternative.** Filtering in the application layer only. That is unprovable and one missed
`where` clause leaks a child's location. With RLS, an RTO officer's `select * from telemetry` returns
zero rows because no policy grants it — DoD #7, proven by `db/rls.test.sql`.

**Status.** BUILT.

---

## ADR #6 — No hardcoded speed limit; operator-set and source-cited

**Decision.** `policy_config.rules.speed.default_limit_kmh` starts `null`. Overspeed is not evaluated
until an operator sets the limit **and** cites its source on `/rto/policy`
(`speedPolicyBanner`, `lib/engine/policy.ts`). The seed ships a clearly-labelled DEMO VALUE so the
app runs out of the box, and the UI shows an amber banner until a real source is entered.

**Rejected alternative.** Baking in a number. The system must never assert a legal limit on its own
authority; a domain judge would (rightly) reject an invented limit.

**Status.** BUILT.

---

## ADR #7 — Manual document entry with a real integration seam, never a faked integration

**Decision.** Vehicle documents are `MANUAL_ENTRY`; every field carries the chip "Manually entered —
pending departmental verification". A `DocumentSourceAdapter` interface + `ManualAdapter`
(`lib/adapters/documentSource.ts`) provide the seam a future verified feed slots into.

**Rejected alternative.** Claiming a Vahan / Sarathi / AIS-140 integration. We do not have those
feeds; faking them would be dishonest and is called out as a PILOT GAP (`departmental-feeds`).

**Status.** BUILT (seam) · NOT BUILT — PILOT GAP (the feed itself).

---

## ADR #8 — Defeating monitoring costs more than the violations it detects

**Decision.** The scoring weights (`policy_config.rules.scoring.deductions`) make
`TRIP_NOT_STARTED` (8) and `SIGNAL_TAMPER` (6) outweigh `OVERSPEED` (4), and `COVERAGE_GAP` carries
**zero** penalty. A blackout with recovered buffered data is a network problem, not conduct; a
blackout with no recovered data is treated as tamper (`signalLost`, `lib/engine/alerts.ts`; tests
#6/#7).

**Rejected alternative.** Penalising every gap equally. That would punish drivers for Kashmir's
network and make switching the app off cheaper than complying — the opposite of the intended
incentive.

**Status.** BUILT.

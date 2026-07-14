/**
 * VERIBUS — SEAL engine stack
 * S · Signal Quality  →  E · Evidence Ledger  →  A · Alerts  →  L · Compliance Ledger
 *
 * Tracking is the input. Evidence is the product.
 */
// ============================================================================
// L · COMPLIANCE LEDGER (BUILD SPEC §11) — never a black box.
//   score = 100 − Σ deduction[class] × confidence_mult[conf] × decay(age) − docs
//   clamp to [0, 100]
// Returns a line-by-line DeductionLedger (rendered as a receipt, not a donut).
// Deterministic: (events, policy_version, now) → identical ledger (test #10).
// ============================================================================
import type {
  DeductionLedger,
  DeductionLine,
  DocPenalty,
  PolicyRules,
  ScorableEvent,
} from './types';

const DAY_MS = 24 * 3600 * 1000;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;

function decayMult(ageDays: number, policy: PolicyRules): number {
  const { half_weight_after_days, drop_after_days } = policy.scoring.decay;
  if (ageDays >= drop_after_days) return 0; // dropped entirely
  if (ageDays <= 0) return 1;
  return Math.pow(0.5, ageDays / half_weight_after_days); // half weight after N days
}

export interface ScoreInput {
  events: ScorableEvent[];
  docLines?: DocPenalty[];
  policy: PolicyRules;
  policyVersion: string;
  now: string; // ISO — passed in so the result is reproducible
}

export function computeScore(input: ScoreInput): DeductionLedger {
  const { policy, policyVersion, now } = input;
  const base = policy.scoring.base;
  const nowMs = Date.parse(now);

  // Sort deterministically so the same set of events always yields the same ledger.
  const events = [...input.events].sort(
    (a, b) =>
      a.occurred_at.localeCompare(b.occurred_at) ||
      a.event_class.localeCompare(b.event_class) ||
      (a.alert_id ?? '').localeCompare(b.alert_id ?? '')
  );
  const docPenalties = [...(input.docLines ?? [])].sort(
    (a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.label.localeCompare(b.label)
  );

  const lines: DeductionLine[] = events.map((e) => {
    const raw = policy.scoring.deductions[e.event_class] ?? 0; // unknown class → 0 (e.g. SIGNAL_PENDING)
    const confMult = policy.scoring.confidence_multiplier[e.confidence] ?? 0;
    const ageDays = Math.max(0, (nowMs - Date.parse(e.occurred_at)) / DAY_MS);
    const dMult = decayMult(ageDays, policy);
    const applied = raw * confMult * dMult;
    return {
      event_class: e.event_class,
      alert_id: e.alert_id ?? null,
      evidence_id: e.evidence_id ?? null,
      occurred_at: e.occurred_at,
      raw_weight: raw,
      confidence: e.confidence,
      conf_mult: confMult,
      age_days: round2(ageDays),
      decay_mult: round4(dMult),
      applied: round4(applied),
    };
  });

  const docLinesOut: DeductionLine[] = docPenalties.map((d) => {
    const raw = policy.scoring.deductions['DOC_EXPIRED'] ?? 0;
    const ageDays = Math.max(0, (nowMs - Date.parse(d.occurred_at)) / DAY_MS);
    // Documents don't decay and don't carry a confidence discount: expired is expired.
    return {
      event_class: 'DOC_EXPIRED',
      alert_id: null,
      evidence_id: d.evidence_id ?? null,
      occurred_at: d.occurred_at,
      raw_weight: raw,
      confidence: 'HIGH',
      conf_mult: 1,
      age_days: round2(ageDays),
      decay_mult: 1,
      applied: raw,
    };
  });

  const totalDeduction =
    lines.reduce((a, l) => a + l.applied, 0) + docLinesOut.reduce((a, l) => a + l.applied, 0);
  const final = Math.max(0, Math.min(100, base - totalDeduction));

  return {
    base,
    lines,
    doc_lines: docLinesOut,
    final: round2(final),
    policy_version: policyVersion,
    computed_at: now,
  };
}

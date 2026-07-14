/**
 * VERIBUS — SEAL engine stack
 * S · Signal Quality  →  E · Evidence Ledger  →  A · Alerts  →  L · Compliance Ledger
 *
 * Tracking is the input. Evidence is the product.
 */
// ============================================================================
// S · SIGNAL QUALITY ENGINE (BUILD SPEC §8) — runs FIRST, before the alert engine.
//   GOOD      — accuracy_m <= speed.max_accuracy_m  AND  speed_mps !== null
//   DEGRADED  — accuracy_m <= signal.degraded_accuracy_m (spec states 60)
//   REJECTED  — everything else
// The alert engine evaluates ONLY GOOD fixes. DEGRADED may only DOWNGRADE
// confidence, never upgrade or trigger.
// ============================================================================
import type { Fix, FixQuality, PolicyRules } from './types';

const DEFAULT_DEGRADED_ACCURACY_M = 60; // §8 states this cutoff explicitly

export function classifyFix(
  fix: Pick<Fix, 'accuracy_m' | 'speed_mps'>,
  policy: PolicyRules
): FixQuality {
  const degradedMax =
    policy.signal.degraded_accuracy_m ?? DEFAULT_DEGRADED_ACCURACY_M;

  if (fix.accuracy_m <= policy.speed.max_accuracy_m && fix.speed_mps !== null) {
    return 'GOOD';
  }
  if (fix.accuracy_m <= degradedMax) {
    return 'DEGRADED';
  }
  return 'REJECTED';
}

/** Assigns quality to a batch of fixes (pure — returns new objects). */
export function classifyFixes(fixes: Fix[], policy: PolicyRules): Fix[] {
  return fixes.map((f) => ({ ...f, quality: classifyFix(f, policy) }));
}

export function goodFixes(fixes: Fix[]): Fix[] {
  return fixes.filter((f) => f.quality === 'GOOD');
}

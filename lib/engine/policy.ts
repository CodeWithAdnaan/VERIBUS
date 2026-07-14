// ============================================================================
// Policy helpers (BUILD SPEC §2, §6, §17). The app reads policy from the DB,
// never from constants. These helpers answer UI questions about policy state.
// ============================================================================
import type { PolicyRules } from './types';

/** True only when a real, non-placeholder limit AND a source have been set. */
export function isSpeedLimitConfigured(policy: PolicyRules): boolean {
  const src = policy.speed.limit_source?.trim() ?? '';
  return (
    policy.speed.default_limit_kmh !== null &&
    policy.speed.default_limit_kmh !== undefined &&
    src.length > 0 &&
    src.toUpperCase() !== 'UNSET'
  );
}

/** True when the limit is set but its source is still a labelled demo placeholder. */
export function isDemoLimitSource(policy: PolicyRules): boolean {
  const src = policy.speed.limit_source?.toUpperCase() ?? '';
  return src.includes('DEMO VALUE');
}

/** The banner the UI must show about overspeed evaluation state. */
export function speedPolicyBanner(
  policy: PolicyRules
): { level: 'disabled' | 'demo' | 'ok'; message: string } {
  if (!isSpeedLimitConfigured(policy)) {
    return {
      level: 'disabled',
      message:
        'Overspeed evaluation disabled — no speed limit configured. Set the limit and cite its source on the Policy screen.',
    };
  }
  if (isDemoLimitSource(policy)) {
    return {
      level: 'demo',
      message:
        'Speed limit is a DEMO VALUE. Cite a real departmental circular before any real inspection is issued. The system does not assert a legal limit on its own authority.',
    };
  }
  return { level: 'ok', message: `Limit source: ${policy.speed.limit_source}` };
}

// ============================================================================
// TRIP START GATE (BUILD SPEC §9) — the anti-gaming layer, as a pure function.
// /api/trip/start calls this; tests #11 and #12 hit it directly (no server).
// A checklist that cannot block anything is decoration.
// ============================================================================
import type { PolicyRules } from './types';

export interface PrecheckAnswer {
  item_code: string;
  ok: boolean;
  note?: string;
}
export interface PrecheckItemLite {
  code: string;
  blocking: boolean;
}
export interface StartGateInput {
  bindVerified: boolean;
  attendantCheckedIn: boolean;
  requireAttendant: boolean; // school.require_attendant
  precheckAnswers: PrecheckAnswer[];
  precheckItems: PrecheckItemLite[];
  policy: PolicyRules;
}
export interface StartGateResult {
  ok: boolean;
  status?: number;
  code?: string;
  message?: string;
}

export function evaluateStartGate(i: StartGateInput): StartGateResult {
  const integ = i.policy.integrity;

  // 1. Vehicle QR bind — kills "phone left at school" and "wrong vehicle".
  if (integ.require_bind && !i.bindVerified) {
    return {
      ok: false,
      status: 409,
      code: 'BIND_REQUIRED',
      message: 'Scan the in-bus QR sticker to bind this phone to the vehicle before starting.',
    };
  }

  // 2. Pre-check gate — any blocking item marked failed stops the trip.
  if (integ.require_precheck) {
    const blocking = new Set(i.precheckItems.filter((p) => p.blocking).map((p) => p.code));
    const failed = i.precheckAnswers.filter((a) => blocking.has(a.item_code) && a.ok === false);
    if (failed.length) {
      return {
        ok: false,
        status: 409,
        code: 'PRECHECK_FAILED',
        message: `Blocking pre-check failed: ${failed.map((a) => a.item_code).join(', ')}`,
      };
    }
  }

  // 3. Attendant check-in (CBSE requirement) when the school requires one.
  if (integ.require_attendant && i.requireAttendant && !i.attendantCheckedIn) {
    return {
      ok: false,
      status: 409,
      code: 'ATTENDANT_REQUIRED',
      message: 'Attendant must check in before the trip can start.',
    };
  }

  return { ok: true };
}

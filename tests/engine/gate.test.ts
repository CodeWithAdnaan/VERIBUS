import { describe, it, expect } from 'vitest';
import { evaluateStartGate } from '@/lib/engine/gate';
import { testPolicy } from './_fixtures';

const policy = testPolicy();
const items = [
  { code: 'DOORS', blocking: true },
  { code: 'BODY_DAMAGE', blocking: false },
];

describe('Trip start gate (§9, §18)', () => {
  // Test #11 — /api/trip/start rejects with 409 when bind_verified = false.
  it('rejects start with 409 BIND_REQUIRED when not bound', () => {
    const r = evaluateStartGate({
      bindVerified: false,
      attendantCheckedIn: true,
      requireAttendant: false,
      precheckAnswers: [{ item_code: 'DOORS', ok: true }],
      precheckItems: items,
      policy,
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(409);
    expect(r.code).toBe('BIND_REQUIRED');
  });

  // Test #12 — /api/trip/start rejects with 409 when a blocking pre-check item failed.
  it('rejects start with 409 PRECHECK_FAILED when a blocking item failed', () => {
    const r = evaluateStartGate({
      bindVerified: true,
      attendantCheckedIn: true,
      requireAttendant: false,
      precheckAnswers: [{ item_code: 'DOORS', ok: false }],
      precheckItems: items,
      policy,
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(409);
    expect(r.code).toBe('PRECHECK_FAILED');
  });

  it('passes a bound trip with all blocking items OK', () => {
    const r = evaluateStartGate({
      bindVerified: true,
      attendantCheckedIn: true,
      requireAttendant: true,
      precheckAnswers: [{ item_code: 'DOORS', ok: true }],
      precheckItems: items,
      policy,
    });
    expect(r.ok).toBe(true);
  });
});

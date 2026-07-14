import { describe, it, expect } from 'vitest';
import { computeScore } from '@/lib/engine/score';
import { at, testPolicy } from './_fixtures';
import type { ScorableEvent } from '@/lib/engine/types';

const policy = testPolicy();

describe('Compliance ledger (§11, §18)', () => {
  const events: ScorableEvent[] = [
    { event_class: 'OVERSPEED', confidence: 'HIGH', occurred_at: at(100), alert_id: 'a1' },
    { event_class: 'ROUTE_DEVIATION', confidence: 'LOW', occurred_at: at(200), alert_id: 'a2' },
    { event_class: 'SIGNAL_TAMPER', confidence: 'HIGH', occurred_at: at(50), alert_id: 'a3' },
  ];

  // Test #10 — the score is reproducible: same events + same policy_version → identical ledger.
  it('is reproducible regardless of input order', () => {
    const l1 = computeScore({ events, policy, policyVersion: 'RTO_JK_v1', now: at(1000) });
    const l2 = computeScore({
      events: [...events].reverse(),
      policy,
      policyVersion: 'RTO_JK_v1',
      now: at(1000),
    });
    expect(l1).toEqual(l2);
    expect(l1.policy_version).toBe('RTO_JK_v1');
  });

  it('applies confidence multipliers (LOW → 0) and clamps to [0,100]', () => {
    const l = computeScore({ events, policy, policyVersion: 'RTO_JK_v1', now: at(1000) });
    // OVERSPEED 4 + LOW deviation 0 + SIGNAL_TAMPER 6 → ~90 (age ~0 → decay ~1).
    expect(l.final).toBeCloseTo(90, 1);
    const deviationLine = l.lines.find((x) => x.event_class === 'ROUTE_DEVIATION');
    expect(deviationLine?.applied).toBe(0);
  });
});

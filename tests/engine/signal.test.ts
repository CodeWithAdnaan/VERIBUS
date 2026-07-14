import { describe, it, expect } from 'vitest';
import { signalLost } from '@/lib/engine/alerts';
import { computeScore } from '@/lib/engine/score';
import { at, classified, makeFix, testPolicy, trip } from './_fixtures';
import type { Fix } from '@/lib/engine/types';

const policy = testPolicy(); // signal_lost_sec = 120

describe('A5 SIGNAL_LOST — coverage-gap vs tamper (§8, §18)', () => {
  // Test #6 — a gap WITH buffered backfill → COVERAGE_GAP, deduction 0.
  it('classifies a backfilled gap as COVERAGE_GAP with zero deduction', () => {
    const pre = [makeFix(1, 0), makeFix(2, 20), makeFix(3, 40)];
    // Network dropped 40s→220s; device kept logging → buffered fixes backfill on reconnect.
    const buffered = [60, 80, 100, 120, 140, 160, 180, 200].map((s, i) =>
      makeFix(10 + i, s, { buffered: true, server_sec: 220 })
    );
    const post = [makeFix(30, 220, { server_sec: 220 })];
    const fixes = classified([...pre, ...buffered, ...post], policy);

    const alerts = signalLost(trip({ status: 'ACTIVE' }), fixes, [], policy, at(240));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.event_class).toBe('COVERAGE_GAP');
    expect(alerts[0]!.subtype).toBe('COVERAGE_GAP');
    expect(alerts[0]!.severity).toBe('INFO');

    const ledger = computeScore({
      events: [{ event_class: 'COVERAGE_GAP', confidence: 'HIGH', occurred_at: at(240) }],
      policy,
      policyVersion: 'RTO_JK_v1',
      now: at(240),
    });
    expect(ledger.lines[0]!.applied).toBe(0);
    expect(ledger.final).toBe(100);
  });

  // Test #7 — a gap WITHOUT backfill → SIGNAL_TAMPER, full deduction.
  it('classifies an unrecovered gap as SIGNAL_TAMPER with full deduction', () => {
    const pre = [makeFix(1, 0), makeFix(2, 20), makeFix(3, 40)];
    // GPS killed 40s→220s; nothing recovered.
    const post = [makeFix(4, 220, { server_sec: 220 })];
    const fixes = classified([...pre, ...post], policy);

    const alerts = signalLost(trip({ status: 'ACTIVE' }), fixes, [], policy, at(240));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.event_class).toBe('SIGNAL_TAMPER');
    expect(alerts[0]!.severity).toBe('CRITICAL');

    const ledger = computeScore({
      events: [{ event_class: 'SIGNAL_TAMPER', confidence: 'HIGH', occurred_at: at(240) }],
      policy,
      policyVersion: 'RTO_JK_v1',
      now: at(240),
    });
    expect(ledger.lines[0]!.applied).toBe(6);
    expect(ledger.final).toBe(94);
  });

  it('raises SIGNAL_TAMPER immediately when gps_permission is denied', () => {
    const fixes: Fix[] = classified([makeFix(1, 0), makeFix(2, 20)], policy);
    const alerts = signalLost(
      trip({ status: 'ACTIVE' }),
      fixes,
      [{ server_ts: at(30), app_state: 'FOREGROUND', gps_permission: 'denied', has_fix: false }],
      policy,
      at(40)
    );
    expect(alerts.some((a) => a.event_class === 'SIGNAL_TAMPER' && a.subtype === 'PERMISSION_DENIED')).toBe(true);
  });
});

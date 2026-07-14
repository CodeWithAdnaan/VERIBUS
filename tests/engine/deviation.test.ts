import { describe, it, expect } from 'vitest';
import { evaluate } from '@/lib/engine/alerts';
import { at, classified, KMH, makeFix, routeA, stopsA, testPolicy, trip } from './_fixtures';
import type { Fix } from '@/lib/engine/types';

const policy = testPolicy();

// ~330 m north of the route corridor (corridor is 60 m) → a real deviation.
const OFF_LAT = 34.0815;
const OFF_LNG = 74.805;

function deviationRun(accuracy_m: number) {
  // 6 fixes, every 10s (50 s span) → sustained (>=45) and >= min_fixes (5).
  const fixes: Fix[] = Array.from({ length: 6 }, (_, i) =>
    makeFix(i + 1, i * 10, { lat: OFF_LAT, lng: OFF_LNG, speed_mps: KMH(20), accuracy_m })
  );
  return evaluate({
    trip: trip(),
    fixes: classified(fixes, policy),
    heartbeats: [],
    route: routeA,
    stops: stopsA,
    policy,
    now: at(600),
  }).alerts.filter((a) => a.type === 'ROUTE_DEVIATION');
}

describe('A3 ROUTE_DEVIATION (§8, §18)', () => {
  // Test #5 — confidence is forced to LOW when mean accuracy is poor.
  it('forces confidence to LOW when mean accuracy is poor (bad GPS ≠ violation)', () => {
    const alerts = deviationRun(40); // accuracy 40 m > poor_accuracy_downgrade_m (25)
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.confidence).toBe('LOW');
    expect(alerts[0]!.metrics.max_deviation_m).toBeGreaterThan(60);
  });

  it('does NOT force LOW when accuracy is good (control)', () => {
    const alerts = deviationRun(10); // accuracy 10 m → GOOD fixes
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.confidence).not.toBe('LOW');
  });
});

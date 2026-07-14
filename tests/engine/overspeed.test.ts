import { describe, it, expect } from 'vitest';
import { evaluate } from '@/lib/engine/alerts';
import {
  at, classified, KMH, makeFix, routeA, stopsA, testPolicy, trip,
} from './_fixtures';
import type { Fix } from '@/lib/engine/types';

const policy = testPolicy();

function run(fixes: Fix[]) {
  return evaluate({
    trip: trip(),
    fixes: classified(fixes, policy),
    heartbeats: [],
    route: routeA,
    stops: stopsA,
    policy,
    now: at(600),
  });
}
const overspeedAlerts = (fixes: Fix[]) =>
  run(fixes).alerts.filter((a) => a.type === 'OVERSPEED');

describe('A1 OVERSPEED (§8, §18)', () => {
  // Test #1 — a sustained overspeed fires EXACTLY ONE alert (not one per fix).
  it('fires exactly one alert for one sustained window', () => {
    // 10 fixes @ 60 km/h, every 2s (18s span), accuracy 10 → GOOD, over 45 km/h.
    const fixes = Array.from({ length: 10 }, (_, i) =>
      makeFix(i + 1, i * 2, { speed_mps: KMH(60), accuracy_m: 10 })
    );
    const alerts = overspeedAlerts(fixes);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.confidence).toBe('HIGH');
    expect(alerts[0]!.metrics.peak_speed_kmh).toBeCloseTo(60, 0);
    expect(alerts[0]!.metrics.limit_applied).toBe(40);
  });

  // Test #2 — a single 1-second GPS spike fires ZERO alerts.
  it('ignores a 1-second speed spike', () => {
    const fixes: Fix[] = [
      makeFix(1, 0, { speed_mps: KMH(30), accuracy_m: 8 }),
      makeFix(2, 2, { speed_mps: KMH(30), accuracy_m: 8 }),
      makeFix(3, 4, { speed_mps: KMH(85), accuracy_m: 8 }), // lone spike
      makeFix(4, 6, { speed_mps: KMH(30), accuracy_m: 8 }),
      makeFix(5, 8, { speed_mps: KMH(30), accuracy_m: 8 }),
    ];
    expect(overspeedAlerts(fixes)).toHaveLength(0);
  });

  // Test #3 — fixes with accuracy_m > max_accuracy_m are excluded from speed eval.
  it('excludes poor-accuracy fixes from speed evaluation', () => {
    // 10 fixes @ 60 km/h but accuracy 40 (> 25) → DEGRADED → not evaluated for speed.
    const fixes = Array.from({ length: 10 }, (_, i) =>
      makeFix(i + 1, i * 2, { speed_mps: KMH(60), accuracy_m: 40 })
    );
    expect(overspeedAlerts(fixes)).toHaveLength(0);
  });

  // Test #4 — when speed_mps is null, NO speed is derived from distance/time.
  it('never derives speed from position when speed_mps is null', () => {
    // Positions jump ~1 km every 2s (would imply ~1800 km/h) but speed is null.
    const fixes = Array.from({ length: 10 }, (_, i) =>
      makeFix(i + 1, i * 2, {
        speed_mps: null,
        accuracy_m: 8,
        lat: 34.07 + i * 0.01, // large jumps
        lng: 74.79 + i * 0.01,
      })
    );
    expect(overspeedAlerts(fixes)).toHaveLength(0);
  });
});

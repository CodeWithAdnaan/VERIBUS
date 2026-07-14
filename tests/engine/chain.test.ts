import { describe, it, expect } from 'vitest';
import { genesis, nextRecord, verifyChain, canonicalJson } from '@/lib/engine/chain';

function cleanChain() {
  const tripId = 'trip-x';
  const g = genesis(tripId);
  const r1 = nextRecord(tripId, 1, 'TRIP_START', { seq: 1, driver: 'd1' }, g);
  const r2 = nextRecord(tripId, 2, 'ALERT', { seq: 2, type: 'OVERSPEED', peak: 61 }, r1.record_hash);
  const r3 = nextRecord(tripId, 3, 'TRIP_END', { seq: 3, distance_m: 4200 }, r2.record_hash);
  return { tripId, records: [r1, r2, r3] };
}

describe('Evidence hash chain (§10, §18)', () => {
  // Test #8 — verifyChain returns valid on a clean chain.
  it('verifies a clean chain', () => {
    const { tripId, records } = cleanChain();
    const v = verifyChain(tripId, records);
    expect(v.valid).toBe(true);
    expect(v.broken_at_seq).toBeNull();
    expect(v.record_count).toBe(3);
  });

  // Test #9 — verifyChain returns broken_at_seq = N on a mutated payload at N.
  it('detects a mutated payload at the exact seq', () => {
    const { tripId, records } = cleanChain();
    const mutated = records.map((r) =>
      r.seq === 2 ? { ...r, payload: { seq: 2, type: 'OVERSPEED', peak: 41 } } : r
    );
    const v = verifyChain(tripId, mutated);
    expect(v.valid).toBe(false);
    expect(v.broken_at_seq).toBe(2);
  });

  it('canonicalJson sorts keys deterministically', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ a: { d: 4, c: 3 }, b: [3, 2, 1] })).toBe(
      '{"a":{"c":3,"d":4},"b":[3,2,1]}'
    );
  });
});

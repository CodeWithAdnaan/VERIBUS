/**
 * VERIBUS — SEAL engine stack
 * S · Signal Quality  →  E · Evidence Ledger  →  A · Alerts  →  L · Compliance Ledger
 *
 * Tracking is the input. Evidence is the product.
 */
// ============================================================================
// E · EVIDENCE LEDGER — SHA-256 tamper-evident hash chain (BUILD SPEC §10).
// Pure + deterministic. NOT a blockchain (not distributed; does not need to be).
//   canonicalJson(obj) = JSON with keys sorted recursively, no whitespace
//   genesis(trip_id)   = sha256(`${trip_id}|GENESIS`)
//   record_hash        = sha256(`${trip_id}|${seq}|${kind}|${canonicalJson(payload)}|${prev_hash}`)
// Append-only. Never UPDATE. Never DELETE.
// ============================================================================
import { createHash } from 'node:crypto';

/** Deterministic JSON: keys sorted recursively, arrays preserved, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  const t = typeof value;
  if (t === 'number' || t === 'boolean') return JSON.stringify(value);
  if (t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonicalJson(v)).join(',') + ']';
  }
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return (
      '{' +
      keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') +
      '}'
    );
  }
  // functions / symbols are not valid evidence payloads
  return 'null';
}

export function sha256hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function genesis(tripId: string): string {
  return sha256hex(`${tripId}|GENESIS`);
}

export function recordHash(
  tripId: string,
  seq: number,
  kind: string,
  payload: unknown,
  prevHash: string
): string {
  return sha256hex(
    `${tripId}|${seq}|${kind}|${canonicalJson(payload)}|${prevHash}`
  );
}

export interface EvidenceRecordLike {
  trip_id?: string;
  seq: number;
  kind: string;
  payload: unknown;
  prev_hash: string;
  record_hash: string;
}

export interface ChainVerdict {
  valid: boolean;
  broken_at_seq: number | null;
  expected_hash: string | null;
  found_hash: string | null;
  record_count: number;
  verified_at?: string;
}

/**
 * Recomputes the whole chain from genesis and reports the FIRST break.
 * A break is either a wrong prev_hash linkage or a payload that no longer
 * hashes to its stored record_hash (i.e. someone mutated a record).
 */
export function verifyChain(
  tripId: string,
  records: EvidenceRecordLike[],
  now?: string
): ChainVerdict {
  const sorted = [...records].sort((a, b) => a.seq - b.seq);
  let prev = genesis(tripId);
  for (const rec of sorted) {
    const expected = recordHash(tripId, rec.seq, rec.kind, rec.payload, prev);
    if (rec.prev_hash !== prev || rec.record_hash !== expected) {
      return {
        valid: false,
        broken_at_seq: rec.seq,
        expected_hash: expected,
        found_hash: rec.record_hash,
        record_count: sorted.length,
        verified_at: now,
      };
    }
    prev = rec.record_hash;
  }
  return {
    valid: true,
    broken_at_seq: null,
    expected_hash: null,
    found_hash: null,
    record_count: sorted.length,
    verified_at: now,
  };
}

/** Build the next record given the previous hash (for the append path). */
export function nextRecord(
  tripId: string,
  seq: number,
  kind: string,
  payload: unknown,
  prevHash: string
): { seq: number; kind: string; payload: unknown; prev_hash: string; record_hash: string } {
  return {
    seq,
    kind,
    payload,
    prev_hash: prevHash,
    record_hash: recordHash(tripId, seq, kind, payload, prevHash),
  };
}

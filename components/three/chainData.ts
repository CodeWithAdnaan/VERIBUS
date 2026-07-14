// The demo evidence chain shared by the 3D hero scene and its static SVG
// fallback, so both tell the identical story: seven records, block 5 tampered.
//
// Hashes are real SHA-256 digests of fixed strings shaped like
// lib/engine/chain.ts records ("<tripId>|<seq>|<kind>|{}|<prev_hash>") with
// tripId "veribus-demo-trip", truncated per lib/format.ts shortHash (6…6).
// They are illustrative — real memos verify at /verify.

export interface ChainBlock {
  seq: number;
  kind: string;
  hash: string;
}

export const CHAIN_BLOCKS: readonly ChainBlock[] = [
  { seq: 1, kind: 'TRIP_START', hash: 'dbf3b8…ee5254' },
  { seq: 2, kind: 'FIX_BATCH', hash: 'fcc7e1…98dcff' },
  { seq: 3, kind: 'FIX_BATCH', hash: 'd4f542…e9ad61' },
  { seq: 4, kind: 'ALERT_OVERSPEED', hash: 'd90eeb…7d78ff' },
  { seq: 5, kind: 'FIX_BATCH', hash: 'f7b093…080b75' },
  { seq: 6, kind: 'ATTENDANT_CONFIRM', hash: 'bba621…d7eefb' },
  { seq: 7, kind: 'TRIP_END', hash: '055e10…b62e26' },
];

/** 0-based index of the tampered record (block #5): the chain breaks between
 *  BREAK_INDEX - 1 and BREAK_INDEX; everything from BREAK_INDEX on is
 *  downstream of the break. */
export const BREAK_INDEX = 4;

/** What block #5's hash recomputes to after the record was altered — it no
 *  longer matches what block #6 sealed. sha256("veribus-demo-trip|TAMPERED"). */
export const MISMATCH_HASH = '009f7a…eaf2f6';

/** One sentence carrying the whole story — the accessible description used by
 *  both the 3D scene and the fallback. */
export const CHAIN_STORY =
  'Seven trip records in a SHA-256 evidence chain, each hash sealed to the previous record. ' +
  'Record 5 was altered after the fact: its recomputed hash no longer matches the one its ' +
  'neighbour sealed, the chain visibly breaks at that link, and every record downstream of ' +
  'the break is no longer trustworthy.';

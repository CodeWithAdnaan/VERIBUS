// Evidence-chain append + verify against the DB (BUILD SPEC §10).
// Append-only. The chain cursor (chain_head + max seq) lives on the trip.
import type { SupabaseClient } from '@supabase/supabase-js';
import { genesis, recordHash, verifyChain, type ChainVerdict } from '@/lib/engine/chain';

export interface AppendedEvidence {
  id: string;
  seq: number;
  record_hash: string;
}

export async function appendEvidence(
  client: SupabaseClient,
  tripId: string,
  kind: string,
  payload: unknown
): Promise<AppendedEvidence> {
  const { data: trip } = await client
    .from('trips')
    .select('chain_head')
    .eq('id', tripId)
    .maybeSingle();
  const { data: maxRow } = await client
    .from('evidence_records')
    .select('seq')
    .eq('trip_id', tripId)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle();

  const prevHash: string = trip?.chain_head ?? genesis(tripId);
  const seq = (maxRow?.seq ?? 0) + 1;
  const rhash = recordHash(tripId, seq, kind, payload, prevHash);

  const { data: rec, error } = await client
    .from('evidence_records')
    .insert({ trip_id: tripId, seq, kind, payload, prev_hash: prevHash, record_hash: rhash })
    .select('id, seq, record_hash')
    .single();
  if (error) throw new Error(`evidence append failed: ${error.message}`);

  await client.from('trips').update({ chain_head: rhash }).eq('id', tripId);
  return { id: rec.id, seq: rec.seq, record_hash: rec.record_hash };
}

export async function verifyTripChain(
  client: SupabaseClient,
  tripId: string,
  now?: string
): Promise<ChainVerdict> {
  const { data } = await client
    .from('evidence_records')
    .select('seq, kind, payload, prev_hash, record_hash')
    .eq('trip_id', tripId)
    .order('seq', { ascending: true });
  return verifyChain(tripId, data ?? [], now);
}

/** Resolve a truncated/short chain hash to its trip (for the public /verify page). */
export async function findTripByChainHash(client: SupabaseClient, hash: string) {
  const { data } = await client
    .from('evidence_records')
    .select('trip_id, seq, kind, created_at')
    .eq('record_hash', hash)
    .maybeSingle();
  return data;
}

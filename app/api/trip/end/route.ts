// POST /api/trip/end — closes the trip; a still-PENDING signal gap now becomes tamper.
export const runtime = 'nodejs';

import { endInput } from '@/lib/zod/schemas';
import { serviceClient } from '@/lib/supabase/server';
import { reevaluateTrip } from '@/lib/server/ingest';
import { appendEvidence } from '@/lib/server/evidence';
import { ok, err, parseBody } from '@/lib/server/http';

export async function POST(req: Request) {
  const p = await parseBody(endInput, req);
  if (!p.ok) return p.res;
  const client = serviceClient();

  const { data: trip } = await client
    .from('trips')
    .select('id, distance_m, monitored_seconds, gap_seconds')
    .eq('id', p.data.trip_id)
    .single();
  if (!trip) return err(404, 'TRIP_NOT_FOUND', 'Trip not found');

  const endedAt = new Date().toISOString();
  await client.from('trips').update({ status: 'COMPLETED', ended_at: endedAt }).eq('id', trip.id);

  // Trip is no longer ACTIVE → a trailing PENDING gap reclassifies to SIGNAL_TAMPER.
  await reevaluateTrip(trip.id).catch(() => {});

  await appendEvidence(client, trip.id, 'TRIP_END', {
    ended_at: endedAt,
    distance_m: trip.distance_m,
    monitored_seconds: trip.monitored_seconds,
    gap_seconds: trip.gap_seconds,
  });

  return ok({ ended: true });
}

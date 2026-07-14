// POST /api/trip/sos — press-and-hold SOS (BUILD SPEC §8 A6). CRITICAL alert +
// evidence instantly, from the last known GOOD fix. NEVER auto-resolves.
export const runtime = 'nodejs';

import { sosInput } from '@/lib/zod/schemas';
import { serviceClient } from '@/lib/supabase/server';
import { sosEvent } from '@/lib/engine/alerts';
import { appendEvidence } from '@/lib/server/evidence';
import { ok, err, parseBody } from '@/lib/server/http';

export async function POST(req: Request) {
  const p = await parseBody(sosInput, req);
  if (!p.ok) return p.res;
  const client = serviceClient();

  const { data: trip } = await client
    .from('trips')
    .select('id, school_id, vehicle_id, driver_id')
    .eq('id', p.data.trip_id)
    .single();
  if (!trip) return err(404, 'TRIP_NOT_FOUND', 'Trip not found');

  const { data: lastFix } = await client
    .from('telemetry')
    .select('lat, lng')
    .eq('trip_id', trip.id)
    .eq('quality', 'GOOD')
    .order('device_ts', { ascending: false })
    .limit(1)
    .maybeSingle();

  const ts = new Date().toISOString();
  const ev = sosEvent({
    ts,
    lat: p.data.lat ?? lastFix?.lat ?? null,
    lng: p.data.lng ?? lastFix?.lng ?? null,
    by: p.data.role,
    role: p.data.role,
  });

  const evidence = await appendEvidence(client, trip.id, 'SOS', {
    ...ev.metrics,
    summary: ev.summary,
    role: p.data.role,
  });
  const { data: alert } = await client
    .from('alerts')
    .insert({
      evidence_id: evidence.id,
      trip_id: trip.id,
      school_id: trip.school_id,
      vehicle_id: trip.vehicle_id,
      driver_id: trip.driver_id,
      type: 'SOS',
      subtype: p.data.role,
      severity: 'CRITICAL',
      confidence: 'HIGH',
      status: 'OPEN',
      started_at: ts,
      summary: ev.summary,
      metrics: ev.metrics,
      identity_key: ev.identity_key,
    })
    .select('id')
    .single();

  return ok({ sos: true, alert_id: alert?.id });
}

// POST /api/replay/start — REPLAY ONLY. Creates + starts an ACTIVE demo trip for a
// route/vehicle so the harness can stream a track into the SAME ingest endpoint.
// The trip is flagged so the UI can show the REPLAY chip. We never hide replay.
export const runtime = 'nodejs';

import { replayStartInput } from '@/lib/zod/schemas';
import { serviceClient } from '@/lib/supabase/server';
import { getActivePolicy } from '@/lib/server/policy';
import { appendEvidence } from '@/lib/server/evidence';
import { ok, err, parseBody } from '@/lib/server/http';

export async function POST(req: Request) {
  const p = await parseBody(replayStartInput, req);
  if (!p.ok) return p.res;
  const client = serviceClient();

  const { data: route } = await client
    .from('routes')
    .select('id, school_id, direction')
    .eq('id', p.data.route_id)
    .single();
  if (!route) return err(404, 'ROUTE_NOT_FOUND', 'Route not found');

  const { data: veh } = await client
    .from('vehicles')
    .select('id')
    .eq('id', p.data.vehicle_id)
    .single();
  if (!veh) return err(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found');

  const { data: drv } = await client
    .from('drivers')
    .select('id')
    .eq('school_id', route.school_id)
    .limit(1)
    .maybeSingle();
  if (!drv) return err(400, 'NO_DRIVER', 'No driver seeded for this school.');

  const active = await getActivePolicy(client);
  const now = new Date();
  const startedAt = now.toISOString();
  const plannedEnd = new Date(now.getTime() + 45 * 60_000).toISOString();

  const { data: trip, error } = await client
    .from('trips')
    .insert({
      school_id: route.school_id,
      route_id: route.id,
      vehicle_id: veh.id,
      driver_id: drv.id,
      direction: route.direction,
      status: 'ACTIVE',
      bind_verified: true,
      precheck_passed: true,
      attendant_checked_in: true,
      planned_start: startedAt,
      planned_end: plannedEnd,
      started_at: startedAt,
      policy_version: active.version,
    })
    .select('id')
    .single();
  if (error) return err(500, 'REPLAY_START_ERROR', error.message);

  await appendEvidence(client, trip.id, 'TRIP_START', {
    started_at: startedAt,
    source: 'REPLAY',
    note: 'Replay-created demo trip',
    policy_version: active.version,
  });

  return ok({ trip_id: trip.id });
}

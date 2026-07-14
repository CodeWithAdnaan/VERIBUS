// POST /api/trip/start — the anti-gaming gate (BUILD SPEC §9). Returns 409 with a
// code when a requirement is unmet. Tests #11/#12 pin the gate logic.
export const runtime = 'nodejs';

import { startInput } from '@/lib/zod/schemas';
import { serviceClient } from '@/lib/supabase/server';
import { getActivePolicy } from '@/lib/server/policy';
import { evaluateStartGate, type PrecheckAnswer, type PrecheckItemLite } from '@/lib/engine/gate';
import { appendEvidence } from '@/lib/server/evidence';
import { ok, err, parseBody } from '@/lib/server/http';

export async function POST(req: Request) {
  const p = await parseBody(startInput, req);
  if (!p.ok) return p.res;
  const client = serviceClient();

  const { data: trip } = await client
    .from('trips')
    .select('id, school_id, route_id, vehicle_id, driver_id, direction, bind_verified, attendant_checked_in, planned_start')
    .eq('id', p.data.trip_id)
    .single();
  if (!trip) return err(404, 'TRIP_NOT_FOUND', 'Trip not found');

  const { data: school } = await client
    .from('schools')
    .select('require_attendant')
    .eq('id', trip.school_id)
    .single();
  const { data: pc } = await client
    .from('trip_prechecks')
    .select('answers')
    .eq('trip_id', trip.id)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: items } = await client
    .from('precheck_items')
    .select('code, blocking')
    .or(`school_id.is.null,school_id.eq.${trip.school_id}`);

  const active = await getActivePolicy(client);

  // Must actually perform the pre-check when it is required.
  if (active.rules.integrity.require_precheck && !pc) {
    return err(409, 'PRECHECK_REQUIRED', 'Complete the pre-check before starting.');
  }

  const gate = evaluateStartGate({
    bindVerified: trip.bind_verified,
    attendantCheckedIn: trip.attendant_checked_in,
    requireAttendant: school?.require_attendant ?? true,
    precheckAnswers: (pc?.answers as PrecheckAnswer[]) ?? [],
    precheckItems: (items as PrecheckItemLite[]) ?? [],
    policy: active.rules,
  });
  if (!gate.ok) {
    if (gate.code === 'PRECHECK_FAILED') {
      await appendEvidence(client, trip.id, 'PRECHECK', { blocked: true, reason: gate.message });
    }
    return err(gate.status ?? 409, gate.code ?? 'START_BLOCKED', gate.message ?? 'Start blocked');
  }

  const now = new Date();
  const startedAt = now.toISOString();
  const plannedEnd = new Date(now.getTime() + 45 * 60_000).toISOString();

  await client
    .from('trips')
    .update({
      status: 'ACTIVE',
      started_at: startedAt,
      planned_start: trip.planned_start ?? startedAt,
      planned_end: plannedEnd,
      policy_version: active.version,
    })
    .eq('id', trip.id);
  await appendEvidence(client, trip.id, 'TRIP_START', {
    started_at: startedAt,
    vehicle_id: trip.vehicle_id,
    driver_id: trip.driver_id,
    direction: trip.direction,
    policy_version: active.version,
  });

  return ok({ started: true, trip_id: trip.id, policy_version: active.version });
}

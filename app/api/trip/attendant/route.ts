// POST /api/trip/attendant — attendant check-in (BUILD SPEC §9). Minimal for the
// pilot: verifies the attendant belongs to the school, records check-in + evidence.
// PIN verification is a PILOT GAP (see /limitations) — we do not ship a fake check.
export const runtime = 'nodejs';

import { z } from 'zod';
import { serviceClient } from '@/lib/supabase/server';
import { appendEvidence } from '@/lib/server/evidence';
import { ok, err, parseBody } from '@/lib/server/http';

const schema = z.object({
  trip_id: z.string().uuid(),
  attendant_id: z.string().uuid(),
});

export async function POST(req: Request) {
  const p = await parseBody(schema, req);
  if (!p.ok) return p.res;
  const client = serviceClient();

  const { data: trip } = await client
    .from('trips')
    .select('id, school_id, attendant_id')
    .eq('id', p.data.trip_id)
    .single();
  if (!trip) return err(404, 'TRIP_NOT_FOUND', 'Trip not found');

  const { data: att } = await client
    .from('attendants')
    .select('id, school_id, full_name')
    .eq('id', p.data.attendant_id)
    .single();
  if (!att || att.school_id !== trip.school_id) {
    return err(409, 'ATTENDANT_INVALID', 'Attendant does not belong to this school.');
  }

  await client
    .from('trips')
    .update({ attendant_checked_in: true, attendant_id: att.id })
    .eq('id', trip.id);
  await appendEvidence(client, trip.id, 'ATTENDANT_CHECKIN', {
    attendant_id: att.id,
    attendant_name: att.full_name,
  });

  return ok({ checked_in: true });
}

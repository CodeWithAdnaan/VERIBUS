// POST /api/trip/precheck — the pre-check GATE writes an answer set + evidence.
export const runtime = 'nodejs';

import { precheckInput } from '@/lib/zod/schemas';
import { serviceClient } from '@/lib/supabase/server';
import { appendEvidence } from '@/lib/server/evidence';
import { ok, err, parseBody } from '@/lib/server/http';

export async function POST(req: Request) {
  const p = await parseBody(precheckInput, req);
  if (!p.ok) return p.res;
  const client = serviceClient();

  const { data: trip } = await client
    .from('trips')
    .select('id, school_id')
    .eq('id', p.data.trip_id)
    .single();
  if (!trip) return err(404, 'TRIP_NOT_FOUND', 'Trip not found');

  const { data: items } = await client
    .from('precheck_items')
    .select('code, blocking')
    .or(`school_id.is.null,school_id.eq.${trip.school_id}`);
  const blocking = new Set((items ?? []).filter((i) => i.blocking).map((i) => i.code));
  const failedBlocking = p.data.answers.filter((a) => blocking.has(a.item_code) && a.ok === false);
  const passed = failedBlocking.length === 0;

  await client.from('trip_prechecks').insert({
    trip_id: trip.id,
    performed_by: p.data.performed_by ?? trip.id,
    answers: p.data.answers,
    passed,
  });
  await client.from('trips').update({ precheck_passed: passed }).eq('id', trip.id);
  await appendEvidence(client, trip.id, 'PRECHECK', {
    passed,
    failed_blocking: failedBlocking.map((a) => a.item_code),
    answers: p.data.answers,
  });

  return ok({ passed, failed_blocking: failedBlocking.map((a) => a.item_code) });
}

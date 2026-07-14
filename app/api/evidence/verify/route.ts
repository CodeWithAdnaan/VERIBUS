// GET /api/evidence/verify?trip_id=… — recomputes the whole chain (BUILD SPEC §10).
export const runtime = 'nodejs';

import { serviceClient } from '@/lib/supabase/server';
import { verifyTripChain } from '@/lib/server/evidence';
import { ok, err } from '@/lib/server/http';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tripId = url.searchParams.get('trip_id');
  if (!tripId) return err(400, 'BAD_REQUEST', 'trip_id is required');
  const verdict = await verifyTripChain(serviceClient(), tripId, new Date().toISOString());
  return ok(verdict);
}

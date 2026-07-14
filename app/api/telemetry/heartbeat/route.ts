// POST /api/telemetry/heartbeat — the driver app sends this every 20s EVEN WITH NO
// GPS FIX (BUILD SPEC §8 A5). A 'denied' permission re-evaluates the trip so a
// SIGNAL_TAMPER is raised immediately.
export const runtime = 'nodejs';

import { heartbeatInput } from '@/lib/zod/schemas';
import { serviceClient } from '@/lib/supabase/server';
import { reevaluateTrip } from '@/lib/server/ingest';
import { ok, err, parseBody } from '@/lib/server/http';

export async function POST(req: Request) {
  const p = await parseBody(heartbeatInput, req);
  if (!p.ok) return p.res;
  const client = serviceClient();
  const { error } = await client.from('heartbeats').insert({
    trip_id: p.data.trip_id,
    app_state: p.data.app_state,
    gps_permission: p.data.gps_permission,
    has_fix: p.data.has_fix,
    battery_pct: p.data.battery_pct ?? null,
  });
  if (error) return err(500, 'HEARTBEAT_ERROR', error.message);

  // Permission revoked mid-trip is an immediate tamper signal — re-evaluate now.
  if (p.data.gps_permission === 'denied') {
    try {
      await reevaluateTrip(p.data.trip_id);
    } catch {
      /* best-effort; the watchdog sweep will catch it otherwise */
    }
  }
  return ok({ recorded: true });
}

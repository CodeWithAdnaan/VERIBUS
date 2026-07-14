// POST /api/trip/bind — verify the in-bus QR HMAC (BUILD SPEC §9).
export const runtime = 'nodejs';

import { bindInput } from '@/lib/zod/schemas';
import { serviceClient } from '@/lib/supabase/server';
import { parseScan, verifyStickerToken } from '@/lib/server/bind';
import { appendEvidence } from '@/lib/server/evidence';
import { metresBetween } from '@/lib/engine/geo';
import { ok, err, parseBody } from '@/lib/server/http';

export async function POST(req: Request) {
  const p = await parseBody(bindInput, req);
  if (!p.ok) return p.res;
  const client = serviceClient();

  const parsed = parseScan(p.data.scan);
  if (!parsed) return err(400, 'BIND_INVALID', 'QR content not recognised.');

  const { data: trip } = await client
    .from('trips')
    .select('id, vehicle_id, route_id')
    .eq('id', p.data.trip_id)
    .single();
  if (!trip) return err(404, 'TRIP_NOT_FOUND', 'Trip not found');
  if (parsed.vehicleId !== trip.vehicle_id) {
    return err(409, 'WRONG_VEHICLE', 'Scanned sticker belongs to a different vehicle than this trip.');
  }

  const { data: veh } = await client
    .from('vehicles')
    .select('id, bind_secret, bus_code')
    .eq('id', trip.vehicle_id)
    .single();
  if (!veh) return err(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found');
  if (!verifyStickerToken(veh.id, veh.bind_secret, parsed.token)) {
    return err(409, 'BIND_INVALID', 'Sticker token did not verify.');
  }

  // Geofence check (PilotGap): flag a bind that happens far from any route stop.
  let outsideGeofence = false;
  if (p.data.lat != null && p.data.lng != null) {
    const { data: stops } = await client.from('stops').select('lat, lng').eq('route_id', trip.route_id);
    if (stops && stops.length > 0) {
      outsideGeofence = !stops.some((s) => metresBetween(p.data.lat!, p.data.lng!, s.lat, s.lng) < 2000);
    }
  }

  await client.from('trips').update({ bind_verified: true }).eq('id', trip.id);
  await appendEvidence(client, trip.id, 'BIND', {
    vehicle_id: veh.id,
    bus_code: veh.bus_code,
    lat: p.data.lat ?? null,
    lng: p.data.lng ?? null,
    outside_known_geofence: outsideGeofence,
  });

  return ok({ bound: true, bus_code: veh.bus_code, outside_known_geofence: outsideGeofence });
}

// ============================================================================
// Geometry helpers (BUILD SPEC §3) — all geometry math lives here, one testable
// module, using @turf/turf. NO PostGIS.
// ============================================================================
import { point, lineString, distance, pointToLineDistance } from '@turf/turf';
import type { GeoLineString, Stop } from './types';

/** Metres between two [lng,lat]-ish points expressed as (lat,lng). */
export function metresBetween(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  return distance(point([aLng, aLat]), point([bLng, bLat]), {
    units: 'meters',
  });
}

/** Perpendicular distance (metres) from a fix to the route polyline. */
export function distanceToRoute(
  lat: number,
  lng: number,
  polyline: GeoLineString
): number {
  if (!polyline?.coordinates || polyline.coordinates.length < 2) return 0;
  return pointToLineDistance(point([lng, lat]), lineString(polyline.coordinates), {
    units: 'meters',
  });
}

export interface NearestStop {
  stop: Stop;
  dist_m: number;
}

export function nearestStop(
  lat: number,
  lng: number,
  stops: Stop[]
): NearestStop | null {
  let best: NearestStop | null = null;
  for (const s of stops) {
    const d = metresBetween(lat, lng, s.lat, s.lng);
    if (!best || d < best.dist_m) best = { stop: s, dist_m: d };
  }
  return best;
}

// Turns telemetry + alerts into chart/map data (speed-time strip + colour-coded
// trace + unmonitored gaps). Pure transforms.
import type { SpeedPoint, ViolationWindow, UnmonitoredGap } from '@/components/charts/SpeedTimeStrip';
import type { TraceSegment, LatLng } from '@/components/map/MapCanvas';

export interface FixRow {
  device_ts: string;
  lat: number;
  lng: number;
  speed_mps: number | null;
  accuracy_m: number;
  quality: 'GOOD' | 'DEGRADED' | 'REJECTED';
}
export interface AlertLite {
  type: string;
  subtype: string | null;
  started_at: string;
  ended_at: string | null;
  metrics: Record<string, unknown>;
}

const ms = (s: string) => Date.parse(s);

export function buildSpeedPoints(fixes: FixRow[]): SpeedPoint[] {
  return fixes
    .filter((f) => f.quality === 'GOOD' || f.quality === 'DEGRADED')
    .map((f) => ({
      t: ms(f.device_ts),
      kmh: f.speed_mps == null ? null : Math.round(f.speed_mps * 3.6),
      quality: f.quality,
    }));
}

export function overspeedWindows(alerts: AlertLite[]): ViolationWindow[] {
  return alerts
    .filter((a) => a.type === 'OVERSPEED')
    .map((a) => ({
      start: ms(a.started_at),
      end: a.ended_at ? ms(a.ended_at) : ms(a.started_at) + 1000,
      peak: Number(a.metrics?.peak_speed_kmh) || undefined,
    }));
}

export function unmonitoredGaps(alerts: AlertLite[]): UnmonitoredGap[] {
  return alerts
    .filter((a) => a.type === 'SIGNAL_LOST')
    .map((a) => ({
      start: ms(a.started_at),
      end: a.ended_at ? ms(a.ended_at) : Date.now(),
    }));
}

function inAny(t: number, ranges: { start: number; end: number }[]): boolean {
  return ranges.some((r) => t >= r.start && t <= r.end);
}

export function traceSegments(fixes: FixRow[], alerts: AlertLite[]): TraceSegment[] {
  const good = fixes
    .filter((f) => f.quality === 'GOOD')
    .sort((a, b) => ms(a.device_ts) - ms(b.device_ts));
  const over = overspeedWindows(alerts);
  const dev = alerts
    .filter((a) => a.type === 'ROUTE_DEVIATION')
    .map((a) => ({ start: ms(a.started_at), end: a.ended_at ? ms(a.ended_at) : ms(a.started_at) + 1000 }));

  const kindOf = (t: number): TraceSegment['kind'] =>
    inAny(t, over) ? 'overspeed' : inAny(t, dev) ? 'deviation' : 'normal';

  const segments: TraceSegment[] = [];
  let cur: TraceSegment | null = null;
  for (const f of good) {
    const kind = kindOf(ms(f.device_ts));
    const pt: LatLng = [f.lat, f.lng];
    if (!cur || cur.kind !== kind) {
      if (cur) cur.coords.push(pt); // bridge the colour change
      cur = { kind, coords: [pt] };
      segments.push(cur);
    } else {
      cur.coords.push(pt);
    }
  }

  // Unmonitored gaps: dashed connector between the fix before and after each gap.
  for (const g of unmonitoredGaps(alerts)) {
    const before = [...good].reverse().find((f) => ms(f.device_ts) <= g.start);
    const after = good.find((f) => ms(f.device_ts) >= g.end);
    if (before && after) {
      segments.push({ kind: 'unmonitored', coords: [[before.lat, before.lng], [after.lat, after.lng]] });
    }
  }
  return segments;
}

// Generates the 5 replay tracks in /seed/tracks by interpolating along Route A's
// synthetic polyline. Each track embeds its scenario so it can be played directly.
//   node scripts/gen-tracks.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROUTE_A_ID = '0a0c0001-0000-4000-8000-0000000000a1';
const VEHICLE_5_ID = '0e100005-0000-4000-8000-000000000005';

const COORDS = [
  [74.79, 34.07], [74.7975, 34.074], [74.805, 34.0785], [74.813, 34.083],
  [74.82, 34.0875], [74.827, 34.092], [74.834, 34.096],
];

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
function haversine(a, b) {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function cumulative(coords) {
  const cum = [0];
  for (let i = 0; i < coords.length - 1; i++) cum.push(cum[i] + haversine(coords[i], coords[i + 1]));
  return cum;
}
const CUM = cumulative(COORDS);
const TOTAL = CUM[CUM.length - 1];

function pointAt(dist) {
  const d = Math.max(0, Math.min(TOTAL, dist));
  let i = 0;
  while (i < CUM.length - 2 && CUM[i + 1] < d) i++;
  const segLen = CUM[i + 1] - CUM[i] || 1;
  const f = (d - CUM[i]) / segLen;
  const a = COORDS[i];
  const b = COORDS[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}
const r6 = (n) => Math.round(n * 1e6) / 1e6;
const r2 = (n) => Math.round(n * 100) / 100;

function generate({ speedAt, offsetAt, gapRange, bufferedRange, dt = 2, total = 300 }) {
  const fixes = [];
  let dist = 0;
  for (let t = 0; t <= total; t += dt) {
    const v = speedAt(t);
    dist = Math.min(TOTAL, dist + v * dt);
    // GPS OFF: no data at all during the gap (nothing recorded, nothing buffered).
    if (gapRange && t > gapRange[0] && t < gapRange[1] && !bufferedRange) continue;
    const p = pointAt(dist);
    const off = offsetAt ? offsetAt(t) : 0;
    const buffered = !!(bufferedRange && t > bufferedRange[0] && t < bufferedRange[1]);
    const fix = { t_offset_s: t, lat: r6(p[1] + off), lng: r6(p[0]), speed_mps: r2(v), accuracy_m: 8 };
    if (buffered) fix.buffered = true;
    fixes.push(fix);
  }
  return fixes;
}

const KMH = (k) => k / 3.6;
const tracks = {
  route_a_clean: {
    name: 'Route A — clean run (~30 km/h)',
    fixes: generate({ speedAt: () => KMH(30) }),
  },
  route_a_overspeed: {
    name: 'Route A — sustained overspeed burst',
    // 60 km/h between t=100..150 (well over the 40+5 demo limit) → one HIGH alert.
    fixes: generate({ speedAt: (t) => (t >= 100 && t <= 150 ? KMH(60) : KMH(30)) }),
  },
  route_a_deviation: {
    name: 'Route A — route deviation',
    // ~330 m off-corridor between t=120..190 → ROUTE_DEVIATION.
    fixes: generate({ speedAt: () => KMH(28), offsetAt: (t) => (t >= 120 && t <= 190 ? 0.003 : 0) }),
  },
  route_a_gps_off: {
    name: 'Route A — GPS OFF (no buffer → SIGNAL_TAMPER)',
    // Nothing recorded 60..200s. On resume there is NO recovered data → tamper.
    fixes: generate({ speedAt: () => KMH(30), gapRange: [60, 200] }),
  },
  route_a_network_gap: {
    name: 'Route A — network drop (buffered backfill → COVERAGE_GAP)',
    // Device keeps recording 60..200s (buffered) and backfills on reconnect → no penalty.
    fixes: generate({ speedAt: () => KMH(30), bufferedRange: [60, 200] }),
  },
};

const dir = resolve(ROOT, 'seed/tracks');
mkdirSync(dir, { recursive: true });
for (const [key, t] of Object.entries(tracks)) {
  const doc = { name: t.name, route_id: ROUTE_A_ID, vehicle_id: VEHICLE_5_ID, fixes: t.fixes };
  writeFileSync(resolve(dir, `${key}.json`), JSON.stringify(doc, null, 2) + '\n');
  console.log(`  → ${key}.json (${t.fixes.length} fixes)`);
}
console.log('✓ Tracks generated.');

// Replay harness host (SERVER). Reads the 5 recorded tracks off disk with node:fs
// and resolves route/vehicle labels, then hands everything to the client harness.
// The harness posts to the SAME /api/telemetry/batch endpoint the phone uses.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Panel } from '@/components/ui/Panel';
import { EmptyState } from '@/components/ui/EmptyState';
import { serviceClient } from '@/lib/supabase/server';
import { ReplayHarness, type Track } from './ReplayHarness';
import { FileWarning } from 'lucide-react';

function loadTracks(): Track[] {
  const dir = join(process.cwd(), 'seed', 'tracks');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const tracks: Track[] = [];
  for (const file of files) {
    try {
      const raw = readFileSync(join(dir, file), 'utf8');
      const parsed = JSON.parse(raw) as {
        name: string;
        route_id: string;
        vehicle_id: string;
        fixes: Track['fixes'];
      };
      if (!parsed.route_id || !parsed.vehicle_id || !Array.isArray(parsed.fixes)) continue;
      tracks.push({
        key: file.replace(/\.json$/, ''),
        name: parsed.name ?? file,
        route_id: parsed.route_id,
        vehicle_id: parsed.vehicle_id,
        fixes: parsed.fixes,
      });
    } catch {
      /* skip an unparseable track rather than crash the page */
    }
  }
  // Stable, presenter-friendly order: clean first, then the anomaly scenarios.
  return tracks.sort((a, b) => a.key.localeCompare(b.key));
}

async function loadLabels(
  tracks: Track[]
): Promise<{ routes: Record<string, string>; vehicles: Record<string, string> }> {
  const routes: Record<string, string> = {};
  const vehicles: Record<string, string> = {};
  const routeIds = [...new Set(tracks.map((t) => t.route_id))];
  const vehicleIds = [...new Set(tracks.map((t) => t.vehicle_id))];
  try {
    const client = serviceClient();
    const [{ data: r }, { data: v }] = await Promise.all([
      client.from('routes').select('id, name').in('id', routeIds),
      client.from('vehicles').select('id, bus_code, registration_no').in('id', vehicleIds),
    ]);
    for (const row of r ?? []) routes[row.id as string] = (row.name as string) ?? (row.id as string);
    for (const row of v ?? [])
      vehicles[row.id as string] =
        (row.bus_code as string) ?? (row.registration_no as string) ?? (row.id as string);
  } catch {
    /* labels are cosmetic; fall through to raw ids */
  }
  return { routes, vehicles };
}

export default async function ReplayPage() {
  let tracks: Track[] = [];
  let readError = false;
  try {
    tracks = loadTracks();
  } catch {
    readError = true;
  }

  if (readError || tracks.length === 0) {
    return (
      <Panel title="Replay harness">
        <EmptyState
          icon={<FileWarning size={28} strokeWidth={1.5} />}
          title="No recorded tracks found"
        >
          Tracks live in <code className="font-mono">seed/tracks/*.json</code>. The harness only
          replays data that already exists on disk — it never fabricates a bus that was not
          actually recorded.
        </EmptyState>
      </Panel>
    );
  }

  const { routes, vehicles } = await loadLabels(tracks);

  return <ReplayHarness tracks={tracks} routeLabels={routes} vehicleLabels={vehicles} />;
}

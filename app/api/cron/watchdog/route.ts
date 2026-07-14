// /api/cron/watchdog — signal-loss re-evaluation + TRIP_NOT_STARTED sweep (§8 A0/A5).
// Runs on a Vercel cron on deploy, and via the "Run schedule sweep" button in /admin
// for the demo. A monitoring system that only sees compliant drivers monitors nothing.
export const runtime = 'nodejs';

import { serviceClient } from '@/lib/supabase/server';
import { reevaluateTrip } from '@/lib/server/ingest';
import { tripNotStarted } from '@/lib/engine/alerts';
import { appendEvidence } from '@/lib/server/evidence';
import { ok } from '@/lib/server/http';

function todayAtUtc(hhmmss: string): string {
  const now = new Date();
  const [h, m, s] = hhmmss.split(':').map((x) => parseInt(x, 10));
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, s || 0));
  return d.toISOString();
}

async function run() {
  const client = serviceClient();
  const nowIso = new Date().toISOString();

  // 1. Re-evaluate every ACTIVE trip → open/resolve signal gaps + tamper.
  const { data: activeTrips } = await client.from('trips').select('id').eq('status', 'ACTIVE');
  let reevaluated = 0;
  for (const t of activeTrips ?? []) {
    try {
      await reevaluateTrip(t.id);
      reevaluated++;
    } catch {
      /* keep sweeping */
    }
  }

  // 2. TRIP_NOT_STARTED sweep.
  const now = new Date();
  const dow = ((now.getUTCDay() + 6) % 7) + 1; // 1=Mon .. 7=Sun
  const startOfDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString();

  const { data: schedules } = await client
    .from('trip_schedules')
    .select('id, route_id, vehicle_id, driver_id, direction, planned_start_local, grace_minutes, days_of_week')
    .eq('active', true);

  let missed = 0;
  for (const s of schedules ?? []) {
    if (!(s.days_of_week as number[]).includes(dow)) continue;
    const plannedIso = todayAtUtc(s.planned_start_local as string);

    const { data: existing } = await client
      .from('trips')
      .select('id, status')
      .eq('route_id', s.route_id)
      .eq('vehicle_id', s.vehicle_id)
      .gte('planned_start', startOfDay);
    const hasLiveOrDone = (existing ?? []).some((t) =>
      ['PRE_CHECK', 'ACTIVE', 'COMPLETED'].includes(t.status)
    );
    const alreadyMissed = (existing ?? []).some((t) => t.status === 'MISSED');
    if (alreadyMissed) continue;

    const ev = tripNotStarted(
      {
        id: s.id,
        route_id: s.route_id,
        vehicle_id: s.vehicle_id,
        driver_id: s.driver_id,
        planned_start_iso: plannedIso,
        grace_minutes: s.grace_minutes,
      },
      hasLiveOrDone,
      nowIso
    );
    if (!ev) continue;

    const { data: route } = await client
      .from('routes')
      .select('school_id')
      .eq('id', s.route_id)
      .single();

    const { data: missedTrip } = await client
      .from('trips')
      .insert({
        schedule_id: s.id,
        school_id: route!.school_id,
        route_id: s.route_id,
        vehicle_id: s.vehicle_id,
        driver_id: s.driver_id,
        direction: s.direction,
        status: 'MISSED',
        planned_start: plannedIso,
      })
      .select('id, school_id')
      .single();
    if (!missedTrip) continue;

    const evidence = await appendEvidence(client, missedTrip.id, 'ALERT', {
      alert_type: 'TRIP_NOT_STARTED',
      ...ev.metrics,
      summary: ev.summary,
    });
    await client.from('alerts').insert({
      evidence_id: evidence.id,
      trip_id: missedTrip.id,
      school_id: missedTrip.school_id,
      vehicle_id: s.vehicle_id,
      driver_id: s.driver_id,
      type: 'TRIP_NOT_STARTED',
      severity: 'CRITICAL',
      confidence: 'HIGH',
      status: 'OPEN',
      started_at: plannedIso,
      summary: ev.summary,
      metrics: ev.metrics,
      identity_key: ev.identity_key,
    });
    missed++;
  }

  return ok({ swept_at: nowIso, active_reevaluated: reevaluated, trips_not_started: missed });
}

export async function POST() {
  return run();
}
export async function GET() {
  return run();
}

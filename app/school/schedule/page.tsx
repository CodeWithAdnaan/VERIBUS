// School-admin manual trip scheduling. Creates a one-off SCHEDULED trip for today
// (route + bus + driver + time). The assigned driver sees it on their board
// immediately (app/driver/page.tsx filters SCHEDULED/PRE_CHECK/ACTIVE + isToday).
import { revalidatePath } from 'next/cache';
import { requireProfile } from '@/lib/server/auth';
import { serviceClient } from '@/lib/supabase/server';
import { Panel } from '@/components/ui/Panel';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { fmtTime } from '@/lib/format';
import { ScheduleForm, type ScheduleResult, type Option } from './ScheduleForm';

export const dynamic = 'force-dynamic';

function isToday(iso: string | null): boolean {
  if (!iso) return true;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

// ── SERVER ACTION: create the trip. Identity + school scoping re-derived here. ──
async function scheduleTrip(formData: FormData): Promise<ScheduleResult> {
  'use server';
  const profile = await requireProfile(['school_admin']);
  if (!profile.school_id) return { ok: false, error: 'No school is linked to this account.' };
  const svc = serviceClient();

  const routeId = String(formData.get('routeId') ?? '').trim();
  const vehicleId = String(formData.get('vehicleId') ?? '').trim();
  const driverId = String(formData.get('driverId') ?? '').trim();
  const time = String(formData.get('time') ?? '').trim();
  if (!routeId || !vehicleId || !driverId) {
    return { ok: false, error: 'Pick a route, a bus and a driver.' };
  }

  try {
    // Validate each entity belongs to THIS school; take direction from the route.
    const [{ data: route }, { data: vehicle }, { data: driver }] = await Promise.all([
      svc.from('routes').select('direction, school_id').eq('id', routeId).maybeSingle(),
      svc.from('vehicles').select('school_id').eq('id', vehicleId).maybeSingle(),
      svc.from('drivers').select('school_id').eq('id', driverId).maybeSingle(),
    ]);
    if (!route || route.school_id !== profile.school_id) return { ok: false, error: 'That route is not in your fleet.' };
    if (!vehicle || vehicle.school_id !== profile.school_id) return { ok: false, error: 'That bus is not in your fleet.' };
    if (!driver || driver.school_id !== profile.school_id) return { ok: false, error: 'That driver is not in your fleet.' };

    // Planned start = today at the chosen time (defaults to now).
    const start = new Date();
    const [hh, mm] = time.split(':').map((n) => Number(n));
    if (Number.isInteger(hh) && Number.isInteger(mm)) start.setHours(hh, mm, 0, 0);

    const { error } = await svc.from('trips').insert({
      school_id: profile.school_id,
      route_id: routeId,
      vehicle_id: vehicleId,
      driver_id: driverId,
      direction: route.direction, // enum from the route
      planned_start: start.toISOString(),
      // status defaults to 'SCHEDULED'
    });
    if (error) return { ok: false, error: 'Could not schedule the trip. Please try again.' };

    revalidatePath('/school/schedule');
    revalidatePath('/driver');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not schedule the trip. Please try again.' };
  }
}

interface TripRow {
  id: string;
  status: string;
  direction: string;
  planned_start: string | null;
  driver_id: string;
  routes: { name: string } | null;
  vehicles: { bus_code: string } | null;
}

export default async function SchedulePage() {
  const profile = await requireProfile(['school_admin']);
  if (!profile.school_id) return <EmptyState title="No school is linked to this account." />;

  const client = serviceClient();
  const schoolId = profile.school_id;

  const [{ data: routes }, { data: vehicles }, { data: drivers }, { data: tripRows }] = await Promise.all([
    client.from('routes').select('id, name, direction').eq('school_id', schoolId).order('name'),
    client.from('vehicles').select('id, bus_code').eq('school_id', schoolId).eq('active', true).order('bus_code'),
    client.from('drivers').select('id, full_name').eq('school_id', schoolId).eq('active', true).order('full_name'),
    client
      .from('trips')
      .select('id, status, direction, planned_start, driver_id, routes(name), vehicles(bus_code)')
      .eq('school_id', schoolId)
      .in('status', ['SCHEDULED', 'PRE_CHECK', 'ACTIVE'])
      .order('planned_start', { ascending: true }),
  ]);

  const routeOpts: Option[] = ((routes ?? []) as { id: string; name: string; direction: string }[]).map((r) => ({
    id: r.id,
    label: `${r.name} · ${r.direction}`,
  }));
  const vehicleOpts: Option[] = ((vehicles ?? []) as { id: string; bus_code: string }[]).map((v) => ({
    id: v.id,
    label: v.bus_code,
  }));
  const driverList = (drivers ?? []) as { id: string; full_name: string }[];
  const driverOpts: Option[] = driverList.map((d) => ({ id: d.id, label: d.full_name }));
  const driverName = new Map(driverList.map((d) => [d.id, d.full_name]));

  const today = ((tripRows ?? []) as unknown as TripRow[]).filter((t) => isToday(t.planned_start));
  const defaultTime = new Date().toTimeString().slice(0, 5); // "HH:MM"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-26 font-semibold text-ink-100 sm:text-34">Schedule a trip</h1>
        <p className="mt-1 max-w-2xl text-13 leading-relaxed text-ink-400">
          Assign a route, bus and driver for today. The trip appears on the driver&rsquo;s phone
          immediately; they bind the bus QR, run the pre-check, and start it.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <Panel title="New trip">
          <ScheduleForm
            routes={routeOpts}
            vehicles={vehicleOpts}
            drivers={driverOpts}
            defaultTime={defaultTime}
            onSubmit={scheduleTrip}
          />
        </Panel>

        <Panel title="Today's scheduled trips" subtitle="Awaiting the driver, or already running">
          {today.length === 0 ? (
            <EmptyState title="Nothing scheduled yet">
              Trips you schedule for today appear here and on the assigned driver&rsquo;s board.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-ink-800">
              {today.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5 text-13">
                  <span className="tnum w-14 shrink-0 text-ink-300">{fmtTime(t.planned_start)}</span>
                  <span className="tnum w-16 shrink-0 font-medium text-ink-100">{t.vehicles?.bus_code ?? '—'}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-300">
                    {t.routes?.name ?? 'Route'} · {driverName.get(t.driver_id) ?? 'Driver'}
                  </span>
                  <Chip variant={t.status === 'ACTIVE' ? 'ok' : t.status === 'PRE_CHECK' ? 'info' : 'neutral'}>
                    {t.status}
                  </Chip>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

// Driver home (BUILD SPEC §9) — today's assigned trips, nothing else. The driver
// taps exactly one thing here: the trip to run. Everything else is silence.
// Designed as a professional PWA with large touch targets.
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Bus, ChevronRight, ShieldOff, QrCode, CheckCircle2, Radio } from 'lucide-react';
import { requireProfile } from '@/lib/server/auth';
import { serviceClient } from '@/lib/supabase/server';
import { PublicShell } from '@/components/shell/PublicShell';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';

type TripStatus = 'SCHEDULED' | 'PRE_CHECK' | 'ACTIVE';

interface TripRow {
  id: string;
  status: TripStatus;
  direction: 'PICKUP' | 'DROP';
  planned_start: string | null;
  bind_verified: boolean;
  precheck_passed: boolean;
  routes: { name: string } | null;
  vehicles: { bus_code: string } | null;
}

function statusChip(status: TripStatus) {
  if (status === 'ACTIVE') return <Chip variant="ok">Live</Chip>;
  if (status === 'PRE_CHECK') return <Chip variant="info">Pre-check</Chip>;
  return <Chip variant="neutral">Scheduled</Chip>;
}

// bind → precheck → run. Send the driver to the furthest step still open.
function nextHref(trip: TripRow): string {
  if (trip.status === 'ACTIVE') return `/driver/trip/${trip.id}/run`;
  if (trip.bind_verified) return `/driver/trip/${trip.id}/precheck`;
  return `/driver/trip/${trip.id}/bind`;
}

function isToday(iso: string | null): boolean {
  if (!iso) return true; // not-yet-planned trips still belong to the driver today
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// Step indicator: shows bind → precheck → trip progression
function StepIndicator({ trip }: { trip: TripRow }) {
  const steps = [
    { done: trip.bind_verified, label: 'Bind', Icon: QrCode },
    { done: trip.precheck_passed, label: 'Check', Icon: CheckCircle2 },
    { done: trip.status === 'ACTIVE', label: 'Live', Icon: Radio },
  ];
  return (
    <div className="flex items-center gap-1">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center gap-1">
          <div
            className={`flex h-5 w-5 items-center justify-center rounded-full ${
              step.done
                ? 'bg-sig-ok/20 text-sig-ok'
                : 'bg-ink-200 text-ink-500'
            }`}
          >
            <step.Icon size={10} strokeWidth={2} />
          </div>
          {i < steps.length - 1 && (
            <div
              className={`h-px w-3 ${step.done ? 'bg-sig-ok/40' : 'bg-ink-300'}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default async function DriverHomePage() {
  const profile = await requireProfile(['driver']);

  let trips: TripRow[] = [];
  let loadError = false;
  let noDriverRow = false;

  try {
    const client = serviceClient();
    const { data: driver } = await client
      .from('drivers')
      .select('id')
      .eq('user_id', profile.id)
      .maybeSingle();

    if (!driver) {
      noDriverRow = true;
    } else {
      const { data } = await client
        .from('trips')
        .select(
          'id, status, direction, planned_start, bind_verified, precheck_passed, routes(name), vehicles(bus_code)'
        )
        .eq('driver_id', driver.id)
        .in('status', ['SCHEDULED', 'PRE_CHECK', 'ACTIVE'])
        .order('planned_start', { ascending: true });
      trips = ((data ?? []) as unknown as TripRow[]).filter((t) => isToday(t.planned_start));
    }
  } catch {
    loadError = true;
  }

  return (
    <PublicShell title="Your trips today">
      <div className="mb-4 text-14 leading-relaxed text-ink-600">
        Signed in as <span className="font-medium text-ink-900">{profile.full_name}</span>. Open a trip to bind your phone to the bus and run it.
      </div>

      {loadError ? (
        <div className="rounded-counter border border-ink-300 bg-paper-2 p-1">
          <EmptyState title="Trips are unavailable right now" icon={<ShieldOff size={26} strokeWidth={1.5} />}>
            We could not reach the schedule. This changes nothing about what is stored — the app
            keeps no location history on this phone, so there is nothing to recover here.
          </EmptyState>
        </div>
      ) : noDriverRow ? (
        <div className="rounded-counter border border-ink-300 bg-paper-2 p-1">
          <EmptyState title="This account is not linked to a driver">
            Ask your school administrator to link your login to your driver record. Until then no
            trips can be assigned to you.
          </EmptyState>
        </div>
      ) : trips.length === 0 ? (
        <div className="rounded-counter border border-ink-300 bg-paper-2 p-1">
          <EmptyState title="No trips assigned today" icon={<Bus size={26} strokeWidth={1.5} />}>
            Trips appear here only when your school schedules them. Nothing runs in the background —
            the app is silent between trips, by design.
          </EmptyState>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {trips.map((trip) => (
            <li key={trip.id}>
              <Link
                href={nextHref(trip)}
                className="flex items-center gap-3 rounded-counter border border-ink-300 bg-paper-2 px-4 py-4 transition-colors duration-120 hover:border-ink-400 active:bg-paper"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-counter border border-ink-200 bg-white">
                  <Bus size={22} strokeWidth={1.5} className="text-ink-500" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-16 font-semibold text-ink-900">
                      {trip.routes?.name ?? 'Route'}
                    </span>
                    {statusChip(trip.status)}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-12 text-ink-600">
                    <span className="tnum">{trip.vehicles?.bus_code ?? 'Bus'}</span>
                    <span aria-hidden>·</span>
                    <span>{trip.direction === 'PICKUP' ? 'Pick-up' : 'Drop-off'}</span>
                  </div>
                  <div className="mt-2">
                    <StepIndicator trip={trip} />
                  </div>
                </div>
                <ChevronRight size={20} strokeWidth={1.5} className="shrink-0 text-ink-400" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PublicShell>
  );
}

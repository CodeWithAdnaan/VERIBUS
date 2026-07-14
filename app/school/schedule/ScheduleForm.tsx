'use client';

// School-admin "Schedule a trip" form. Picks a route + bus + driver (+ time) and
// creates a one-off SCHEDULED trip for today via the server action. The assigned
// driver sees it on their board immediately. Follows the server-action-as-prop +
// useTransition idiom used by the parent ComplaintForm.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export interface ScheduleResult {
  ok: boolean;
  error?: string;
}

export interface Option {
  id: string;
  label: string;
}

const labelCls = 'mb-1 block text-11 font-medium uppercase tracking-[0.1em] text-ink-300';
const fieldCls =
  'w-full rounded-ops border border-ink-700 bg-ink-950 px-3 py-2.5 text-14 text-ink-100 outline-none transition-colors focus:border-viz-1 focus:ring-1 focus:ring-viz-1/40';

export function ScheduleForm({
  routes,
  vehicles,
  drivers,
  defaultTime,
  onSubmit,
}: {
  routes: Option[];
  vehicles: Option[];
  drivers: Option[];
  defaultTime: string;
  onSubmit: (formData: FormData) => Promise<ScheduleResult>;
}) {
  const router = useRouter();
  const [routeId, setRouteId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [time, setTime] = useState(defaultTime);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ScheduleResult | null>(null);

  const canSubmit = routeId !== '' && vehicleId !== '' && driverId !== '' && !pending;

  function submit() {
    const fd = new FormData();
    fd.set('routeId', routeId);
    fd.set('vehicleId', vehicleId);
    fd.set('driverId', driverId);
    fd.set('time', time);
    startTransition(async () => {
      const r = await onSubmit(fd);
      setResult(r);
      if (r.ok) {
        setRouteId('');
        setVehicleId('');
        setDriverId('');
        router.refresh(); // re-render the "today's scheduled trips" list below
      }
    });
  }

  const emptyDropdowns = routes.length === 0 || vehicles.length === 0 || drivers.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {result?.ok && (
        <p className="flex items-center gap-2 rounded-ops border border-sig-ok/40 bg-sig-ok/[0.08] px-3 py-2 text-12 text-sig-ok">
          <CheckCircle2 size={15} strokeWidth={1.75} aria-hidden />
          Trip scheduled for today — it now shows on that driver&rsquo;s board.
        </p>
      )}
      {result && !result.ok && (
        <p className="rounded-ops border border-sig-alert/40 bg-sig-alert/[0.06] px-3 py-2 text-12 text-sig-alert">
          {result.error ?? 'Could not schedule the trip.'}
        </p>
      )}

      {emptyDropdowns && (
        <p className="rounded-ops border border-sig-watch/40 bg-sig-watch/[0.06] px-3 py-2 text-12 text-sig-watch">
          This school needs at least one route, one active bus and one active driver before a trip can
          be scheduled.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="route" className={labelCls}>
            Route
          </label>
          <select id="route" className={fieldCls} value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            <option value="" disabled>
              Select a route…
            </option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="vehicle" className={labelCls}>
            Bus
          </label>
          <select id="vehicle" className={fieldCls} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="" disabled>
              Select a bus…
            </option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="driver" className={labelCls}>
            Driver
          </label>
          <select id="driver" className={fieldCls} value={driverId} onChange={(e) => setDriverId(e.target.value)}>
            <option value="" disabled>
              Select a driver…
            </option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="time" className={labelCls}>
            Planned start (today)
          </label>
          <input
            id="time"
            type="time"
            className={fieldCls}
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      </div>

      <Button variant="primary" onClick={submit} disabled={!canSubmit} className="justify-center py-2.5">
        <CalendarPlus size={16} strokeWidth={1.75} aria-hidden />
        {pending ? 'Scheduling…' : 'Schedule trip'}
      </Button>
    </div>
  );
}

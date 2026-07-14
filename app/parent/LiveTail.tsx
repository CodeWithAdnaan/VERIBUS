'use client';
// The "small client child" (BUILD SPEC §15): renders the live map and polls the tail
// every ~10s via a server action. The action re-checks the trip through RLS, so a
// withdrawn consent or an ended trip LOCKS the map — the child cannot see stale data.
import { useEffect, useState } from 'react';
import { EyeOff, SatelliteDish } from 'lucide-react';
import { MapView } from '@/components/map/MapView';
import { EmptyState } from '@/components/ui/EmptyState';
import type { BusMarker, LatLng, MapStop } from '@/components/map/MapCanvas';

export interface TailResult {
  ok: boolean; // false = transient error → keep last known
  ended: boolean; // trip no longer visible via RLS → lock the map
  bus: BusMarker | null;
  busTs: number | null;
  tail: LatLng[];
}

const POLL_MS = 10_000;

export function LiveTail({
  tripId,
  route,
  stops,
  initialBus,
  initialBusTs,
  initialTail,
  refresh,
}: {
  tripId: string;
  route: LatLng[];
  stops: MapStop[];
  initialBus: BusMarker | null;
  initialBusTs: number | null;
  initialTail: LatLng[];
  refresh: (tripId: string) => Promise<TailResult>;
}) {
  const [bus, setBus] = useState<BusMarker | null>(initialBus);
  const [busTs, setBusTs] = useState<number | null>(initialBusTs);
  const [tail, setTail] = useState<LatLng[]>(initialTail);
  const [locked, setLocked] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (locked) return;
    let alive = true;

    const poll = async () => {
      try {
        const r = await refresh(tripId);
        if (!alive) return;
        if (!r.ok) return; // transient — keep last known
        if (r.ended) {
          setLocked(true);
          return;
        }
        setTail(r.tail);
        setBus(r.bus);
        setBusTs(r.busTs);
      } catch {
        /* keep last known position */
      }
    };

    const dataIv = setInterval(poll, POLL_MS);
    const clockIv = setInterval(() => alive && setNow(Date.now()), 5_000);
    return () => {
      alive = false;
      clearInterval(dataIv);
      clearInterval(clockIv);
    };
  }, [tripId, locked, refresh]);

  if (locked) {
    return (
      <div className="overflow-hidden rounded-counter border border-ink-700 bg-ink-950">
        <EmptyState icon={<EyeOff size={28} strokeWidth={1.5} />} title="Trip ended — live view locked.">
          The bus has completed its trip, so this view has closed. It reopens only on the next live
          trip — nothing is retained here for you to scroll back through, by design.
        </EmptyState>
      </div>
    );
  }

  const ageSec = busTs == null ? undefined : Math.max(0, (now - busTs) / 1000);
  const marker: BusMarker | null = bus ? { ...bus, ageSec } : null;

  return (
    <div className="flex flex-col gap-2">
      <MapView
        basemap="light"
        route={route}
        stops={stops}
        segments={tail.length > 1 ? [{ kind: 'normal', coords: tail }] : []}
        bus={marker}
        height={420}
      />
      {!marker && (
        <p className="flex items-center gap-1.5 text-12 text-ink-600">
          <SatelliteDish size={14} strokeWidth={1.75} className="text-sig-unmonitored" aria-hidden />
          Waiting for a live fix — no position reported in the last few minutes.
        </p>
      )}
    </div>
  );
}

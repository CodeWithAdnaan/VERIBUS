'use client';
// TRIP MODE (BUILD SPEC §9). The driver must not touch the phone while driving,
// so this screen offers nothing but SOS and END. It holds a Wake Lock, watches
// GPS, and writes every fix to an IndexedDB buffer BEFORE sending it — so a lost
// signal backfills later instead of vanishing. It heartbeats every 20s even with
// no fix, which is what makes a coverage gap honest rather than hidden.
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Radio, WifiOff, BatteryMedium, ShieldAlert } from 'lucide-react';
import { PressHold } from '@/components/ui/PressHold';
import { Chip } from '@/components/ui/Chip';
import { kmhFromMps } from '@/lib/format';
import { nextSeq, enqueue, peekAll, clear, count, type Fix } from '@/lib/offline/buffer';

type Perm = 'granted' | 'denied' | 'prompt';

// Minimal shapes for APIs not in the standard DOM lib we ship against.
type WakeLockSentinelLike = {
  release: () => Promise<void>;
  addEventListener?: (type: string, cb: () => void) => void;
};
type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
};
type BatteryLike = { level: number; addEventListener?: (type: string, cb: () => void) => void };
type NavigatorWithBattery = Navigator & { getBattery?: () => Promise<BatteryLike> };

function appState(): 'FOREGROUND' | 'BACKGROUND' {
  return typeof document !== 'undefined' && document.visibilityState === 'visible'
    ? 'FOREGROUND'
    : 'BACKGROUND';
}

export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = use(params);
  const router = useRouter();

  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  const [perm, setPermState] = useState<Perm>('prompt');
  const [hasFix, setHasFixState] = useState(false);
  const [battery, setBattery] = useState<number | null>(null);
  const [monitored, setMonitored] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [netError, setNetError] = useState(false);
  const [distract, setDistract] = useState(false);
  const [sosState, setSosState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [ending, setEnding] = useState(false);

  const permRef = useRef<Perm>('prompt');
  const hasFixRef = useRef(false);
  const batteryRef = useRef<number | null>(null);
  const speedKmhRef = useRef<number | null>(null);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const retryRef = useRef(false); // true once a send has failed → we are backfilling
  const endingRef = useRef(false);
  const tapsRef = useRef<number[]>([]);

  function setPerm(v: Perm) {
    permRef.current = v;
    setPermState(v);
  }
  function setHasFix(v: boolean) {
    hasFixRef.current = v;
    setHasFixState(v);
  }

  // Drain the buffer to the server. Fixes are only deleted after a 200 — a failure
  // leaves them queued and marks the run as backfilling so replays are labelled.
  const flush = useCallback(async () => {
    const pending = await peekAll();
    if (pending.length === 0) {
      setBuffered(0);
      return;
    }
    const backfilling = retryRef.current;
    const fixes: Fix[] = pending.map((p) => ({
      seq: p.seq,
      device_ts: p.device_ts,
      lat: p.lat,
      lng: p.lng,
      speed_mps: p.speed_mps,
      heading: p.heading,
      accuracy_m: p.accuracy_m,
      app_state: p.app_state,
      buffered: backfilling ? true : p.buffered,
    }));
    try {
      const res = await fetch('/api/telemetry/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trip_id: tripId, source: 'DEVICE', fixes }),
      });
      if (res.ok) {
        await clear(pending.map((p) => p.id));
        retryRef.current = false;
        setNetError(false);
        setMonitored((c) => c + pending.length);
        setBuffered(await count());
      } else {
        retryRef.current = true;
        setNetError(true);
        setBuffered(pending.length);
      }
    } catch {
      retryRef.current = true;
      setNetError(true);
      setBuffered(pending.length);
    }
  }, [tripId]);

  useEffect(() => {
    let watchId: number | null = null;
    let sentinel: WakeLockSentinelLike | null = null;
    let disposed = false;

    async function requestWake() {
      const nav = navigator as NavigatorWithWakeLock;
      if (!nav.wakeLock) return;
      try {
        sentinel = await nav.wakeLock.request('screen');
        sentinel.addEventListener?.('release', () => {
          sentinel = null;
        });
      } catch {
        /* wake lock is best-effort */
      }
    }
    const onVisibility = () => {
      // Re-acquire the wake lock when the driver returns to the app.
      if (document.visibilityState === 'visible' && !sentinel && !disposed) requestWake();
    };

    async function onPosition(pos: GeolocationPosition) {
      const c = pos.coords;
      const seq = await nextSeq();
      const fix: Fix = {
        seq,
        device_ts: new Date().toISOString(),
        lat: c.latitude,
        lng: c.longitude,
        // GPS Doppler speed ONLY. It may be null — we NEVER derive it from position.
        speed_mps: c.speed,
        heading: c.heading != null && !Number.isNaN(c.heading) ? c.heading : null,
        accuracy_m: c.accuracy,
        app_state: appState(),
        buffered: false,
      };
      await enqueue(fix);
      coordsRef.current = { lat: c.latitude, lng: c.longitude };
      setPerm('granted');
      setHasFix(true);
      const kmh = kmhFromMps(c.speed);
      speedKmhRef.current = kmh;
      setSpeedKmh(kmh);
      await flush();
    }
    function onPositionError(e: GeolocationPositionError) {
      if (e.code === e.PERMISSION_DENIED) setPerm('denied');
      setHasFix(false);
    }

    async function heartbeat() {
      try {
        await fetch('/api/telemetry/heartbeat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            trip_id: tripId,
            app_state: appState(),
            gps_permission: permRef.current,
            has_fix: hasFixRef.current,
            battery_pct: batteryRef.current,
          }),
        });
      } catch {
        /* heartbeats are best-effort; the watchdog sweep is the backstop */
      }
    }

    // Wake lock
    requestWake();
    document.addEventListener('visibilitychange', onVisibility);

    // Battery (non-standard API — degrade silently)
    const batNav = navigator as NavigatorWithBattery;
    if (batNav.getBattery) {
      batNav
        .getBattery()
        .then((b) => {
          const read = () => {
            const pct = Math.round(b.level * 100);
            batteryRef.current = pct;
            setBattery(pct);
          };
          read();
          b.addEventListener?.('levelchange', read);
        })
        .catch(() => {});
    }

    // Permission state (and live changes)
    navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .then((status) => {
        setPerm(status.state as Perm);
        status.onchange = () => setPerm(status.state as Perm);
      })
      .catch(() => {});

    // Geolocation watch — the core of Trip Mode
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      });
    } else {
      setPerm('denied');
      setHasFix(false);
    }

    // Heartbeat now, then every 20s — EVEN WITH NO FIX.
    heartbeat();
    const hb = window.setInterval(heartbeat, 20000);

    count().then(setBuffered).catch(() => {});

    return () => {
      disposed = true;
      if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
      window.clearInterval(hb);
      document.removeEventListener('visibilitychange', onVisibility);
      sentinel?.release?.().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flush, tripId]);

  // Distraction heuristic: repeated taps while moving → a nudge, best-effort only.
  function onScreenTap() {
    const now = Date.now();
    tapsRef.current = tapsRef.current.filter((t) => now - t < 3000);
    tapsRef.current.push(now);
    if ((speedKmhRef.current ?? 0) > 5 && tapsRef.current.length >= 5) {
      setDistract(true);
      tapsRef.current = [];
      window.setTimeout(() => setDistract(false), 6000);
    }
  }

  async function handleSOS() {
    setSosState('sending');
    try {
      await fetch('/api/trip/sos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          trip_id: tripId,
          role: 'driver',
          lat: coordsRef.current?.lat ?? null,
          lng: coordsRef.current?.lng ?? null,
        }),
      });
      setSosState('sent');
      window.setTimeout(() => setSosState('idle'), 6000);
    } catch {
      setSosState('idle');
    }
  }

  async function handleEnd() {
    if (endingRef.current) return;
    endingRef.current = true;
    setEnding(true);
    await flush().catch(() => {}); // push any last fixes before we close
    try {
      await fetch('/api/trip/end', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trip_id: tripId }),
      });
    } catch {
      /* best-effort; the trip end also reconciles on the server */
    }
    router.push('/driver');
  }

  const gpsChip =
    perm === 'denied' ? (
      <Chip variant="alert">GPS blocked</Chip>
    ) : hasFix ? (
      <Chip variant="ok">GPS on</Chip>
    ) : (
      <Chip variant="watch">Acquiring…</Chip>
    );

  return (
    <div
      onClick={onScreenTap}
      className="fixed inset-0 flex select-none flex-col bg-ink-950 text-ink-100"
    >
      {/* Status strip */}
      <div className="flex items-center justify-between gap-2 border-b border-ink-800 px-4 py-3">
        <div className="flex items-center gap-2">
          {gpsChip}
          {netError && <Chip variant="watch">Offline — buffering</Chip>}
        </div>
        <div className="flex items-center gap-3 text-14 text-ink-400">
          {battery != null && (
            <span className="flex items-center gap-1">
              <BatteryMedium size={15} strokeWidth={1.75} aria-hidden />
              <span className="tnum">{battery}%</span>
            </span>
          )}
        </div>
      </div>

      {/* Speed — huge, calm, never guessed */}
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        {perm === 'denied' ? (
          <div className="max-w-sm text-center">
            <WifiOff size={44} strokeWidth={1.25} className="mx-auto text-sig-alert" aria-hidden />
            <p className="mt-4 text-26 font-semibold text-sig-alert">Location is blocked</p>
            <p className="mt-2 text-14 leading-relaxed text-ink-300">
              Enable location for this app to resume monitoring. The trip stays open and keeps sending
              heartbeats, so the gap is recorded honestly — not hidden.
            </p>
          </div>
        ) : (
          <div className="text-center">
            <div className="tnum text-[96px] font-semibold leading-none">
              {speedKmh ?? '—'}
            </div>
            <div className="mt-3 text-20 uppercase tracking-[0.25em] text-ink-400">km/h</div>
            {speedKmh == null && hasFix && (
              <p className="mx-auto mt-5 max-w-xs text-14 leading-relaxed text-ink-500">
                Your phone did not report a Doppler speed for this fix. We never estimate speed from
                position, so it stays blank rather than showing a wrong number.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Live counters */}
      <div className="flex items-center justify-center gap-6 border-t border-ink-800 px-4 py-3 text-center">
        <div>
          <div className="flex items-center justify-center gap-1 text-11 uppercase tracking-[0.08em] text-ink-500">
            <Radio size={12} strokeWidth={1.75} aria-hidden /> Monitored
          </div>
          <div className="tnum mt-0.5 text-20 font-semibold text-ink-100">{monitored}</div>
        </div>
        <div>
          <div className="text-11 uppercase tracking-[0.08em] text-ink-500">Buffered</div>
          <div
            className={`tnum mt-0.5 text-20 font-semibold ${buffered > 0 ? 'text-sig-watch' : 'text-ink-100'}`}
          >
            {buffered}
          </div>
        </div>
      </div>

      {distract && (
        <div className="mx-4 mb-2 flex items-center justify-center gap-2 rounded-ops border border-sig-watch/50 bg-sig-watch/10 px-3 py-2 text-center text-14 text-sig-watch">
          <ShieldAlert size={16} strokeWidth={1.75} aria-hidden />
          Eyes on the road — this screen needs nothing from you while moving.
        </div>
      )}

      {sosState === 'sent' && (
        <div className="mx-4 mb-2 rounded-ops border border-sig-critical/60 bg-sig-critical/10 px-3 py-2 text-center text-14 font-medium text-sig-critical">
          SOS sent. It is logged as evidence and will not auto-resolve.
        </div>
      )}

      {/* The ONLY two controls */}
      <div className="flex flex-col gap-3 p-4">
        <PressHold
          label={sosState === 'sending' ? 'Sending SOS…' : 'SOS — hold'}
          holdingLabel="Keep holding for SOS…"
          holdMs={2000}
          tone="danger"
          onComplete={handleSOS}
        />
        <PressHold
          label={ending ? 'Ending…' : 'END TRIP — hold'}
          holdingLabel="Keep holding to end…"
          holdMs={2000}
          tone="primary"
          onComplete={handleEnd}
        />
      </div>
    </div>
  );
}

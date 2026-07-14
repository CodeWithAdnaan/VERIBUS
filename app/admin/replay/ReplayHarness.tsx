'use client';

// THE REPLAY HARNESS (BUILD SPEC §14).
// Posts recorded tracks into the SAME /api/telemetry/batch endpoint the phone uses,
// always flagged source:'REPLAY'. Replay is never disguised as live — the REPLAY chip
// is always on screen. The demo climax lives in the buffered/gps-off distinction:
//   • buffered:true fixes are HELD during a gap then backfilled → engine yields COVERAGE_GAP.
//   • a track with a hole and no buffered data → engine yields SIGNAL_TAMPER on the sweep.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  PlayCircle, Pause, Play, RefreshCw, Radio, WifiOff, Cable, Siren, ArrowRight, Gauge,
} from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { fmtTime } from '@/lib/format';

// ── Types ────────────────────────────────────────────────────────────────────
export interface TrackFix {
  t_offset_s: number;
  lat: number;
  lng: number;
  speed_mps: number | null;
  accuracy_m: number;
  buffered?: boolean;
}
export interface Track {
  key: string;
  name: string;
  route_id: string;
  vehicle_id: string;
  fixes: TrackFix[];
}
interface OutFix {
  seq: number;
  device_ts: string;
  lat: number;
  lng: number;
  speed_mps: number | null;
  heading: null;
  accuracy_m: number;
  app_state: 'FOREGROUND';
  buffered: boolean;
}
type Status = 'idle' | 'running' | 'paused' | 'done';
type LogEntry =
  | { id: number; ts: string; kind: 'batch'; label: string; inserted: number; alerts: number; new_alerts: number }
  | { id: number; ts: string; kind: 'info' | 'error'; label: string; text: string };
// Distribute Omit over the union so each member keeps its own fields.
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
type NewLog = DistributiveOmit<LogEntry, 'id' | 'ts'>;

// ── Helpers ──────────────────────────────────────────────────────────────────
const trackEndMs = (t: Track): number =>
  t.fixes.reduce((m, f) => Math.max(m, f.t_offset_s), 0) * 1000;

const bufferedCount = (t: Track): number => t.fixes.filter((f) => f.buffered).length;

function scenarioHint(key: string): string {
  if (key.includes('clean')) return 'Clean run — expect no alerts. The honest baseline.';
  if (key.includes('overspeed')) return 'Sustained overspeed burst → OVERSPEED.';
  if (key.includes('deviation')) return 'Leaves the route corridor → ROUTE_DEVIATION.';
  if (key.includes('network_gap'))
    return 'Network drops mid-trip; fixes are buffered and backfilled → COVERAGE_GAP (no penalty).';
  if (key.includes('gps_off'))
    return 'GPS switched off mid-trip, nothing buffered → SIGNAL_TAMPER on the sweep.';
  return 'Recorded track.';
}

const mmss = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ── Component ────────────────────────────────────────────────────────────────
export function ReplayHarness({
  tracks,
  routeLabels,
  vehicleLabels,
}: {
  tracks: Track[];
  routeLabels: Record<string, string>;
  vehicleLabels: Record<string, string>;
}) {
  const [selectedKey, setSelectedKey] = useState<string>(tracks[0]?.key ?? '');
  const [tripId, setTripId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [speed, setSpeed] = useState<1 | 5 | 20>(1);
  const [simMs, setSimMs] = useState(0);
  const [gpsOff, setGpsOff] = useState(false);
  const [netDrop, setNetDrop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);

  // Engine state (refs so the animation loop never fights React re-renders).
  const statusRef = useRef<Status>('idle');
  const speedRef = useRef<number>(1);
  const tripIdRef = useRef<string | null>(null);
  const baseTimeRef = useRef<number>(0);
  const simMsRef = useRef<number>(0);
  const endMsRef = useRef<number>(0);
  const nextIdxRef = useRef<number>(0);
  const fixesRef = useRef<TrackFix[]>([]);
  const heldRef = useRef<{ f: TrackFix; index: number }[]>([]);
  const gpsOffRef = useRef(false);
  const netDropRef = useRef(false);
  const lastFrameRef = useRef<number>(0);
  const finishedRef = useRef(false);
  const logIdRef = useRef(0);
  const stepRef = useRef<() => void>(() => {});

  const setStatusBoth = useCallback((s: Status) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  const appendLog = useCallback((e: NewLog) => {
    const entry = { ...e, id: logIdRef.current++, ts: new Date().toISOString() } as LogEntry;
    setLog((prev) => [entry, ...prev].slice(0, 100));
  }, []);

  const buildFix = useCallback((f: TrackFix, index: number, buffered: boolean): OutFix => ({
    seq: index,
    device_ts: new Date(baseTimeRef.current + f.t_offset_s * 1000).toISOString(),
    lat: f.lat,
    lng: f.lng,
    speed_mps: f.speed_mps ?? null,
    heading: null,
    accuracy_m: f.accuracy_m,
    app_state: 'FOREGROUND',
    buffered,
  }), []);

  const postBatch = useCallback(
    async (fixes: OutFix[], label: string): Promise<void> => {
      const trip = tripIdRef.current;
      if (!trip || fixes.length === 0) return;
      try {
        const res = await fetch('/api/telemetry/batch', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ trip_id: trip, source: 'REPLAY', fixes }),
        });
        const json = (await res.json()) as {
          inserted?: number; alerts?: number; new_alerts?: number; error?: string; message?: string;
        };
        if (!res.ok) {
          appendLog({ kind: 'error', label, text: `${json.error ?? res.status}: ${json.message ?? ''}` });
          return;
        }
        appendLog({
          kind: 'batch',
          label,
          inserted: json.inserted ?? 0,
          alerts: json.alerts ?? 0,
          new_alerts: json.new_alerts ?? 0,
        });
      } catch (e) {
        appendLog({ kind: 'error', label, text: (e as Error).message });
      }
    },
    [appendLog]
  );

  const runWatchdog = useCallback(
    async (mode: 'auto' | 'manual'): Promise<void> => {
      try {
        const res = await fetch('/api/cron/watchdog', { method: 'POST' });
        const json = (await res.json()) as {
          active_reevaluated?: number; trips_not_started?: number; error?: string; message?: string;
        };
        if (!res.ok) {
          appendLog({ kind: 'error', label: 'SWEEP', text: `${json.error ?? res.status}: ${json.message ?? ''}` });
          return;
        }
        appendLog({
          kind: 'info',
          label: mode === 'auto' ? 'SWEEP (auto)' : 'SWEEP',
          text: `re-evaluated ${json.active_reevaluated ?? 0} active · trips-not-started ${json.trips_not_started ?? 0}`,
        });
      } catch (e) {
        appendLog({ kind: 'error', label: 'SWEEP', text: (e as Error).message });
      }
    },
    [appendLog]
  );

  const flushHeld = useCallback((): void => {
    const held = heldRef.current;
    if (held.length === 0) return;
    heldRef.current = [];
    void postBatch(held.map((h) => buildFix(h.f, h.index, true)), `BACKFILL ${held.length}`);
  }, [postBatch, buildFix]);

  const processCrossed = useCallback((): void => {
    const fixes = fixesRef.current;
    const live: { f: TrackFix; index: number }[] = [];
    while (nextIdxRef.current < fixes.length) {
      const idx = nextIdxRef.current;
      const f = fixes[idx]!;
      if (f.t_offset_s * 1000 > simMsRef.current) break;
      nextIdxRef.current = idx + 1;
      if (gpsOffRef.current) continue; // GPS off: nothing recorded, nothing buffered
      if (f.buffered || netDropRef.current) {
        heldRef.current.push({ f, index: idx }); // withheld → backfilled on reconnect
      } else {
        live.push({ f, index: idx });
      }
    }
    // A live fix arriving after a buffered run means the link is back → backfill first.
    if (live.length > 0 && heldRef.current.length > 0 && !netDropRef.current) {
      flushHeld();
    }
    if (live.length > 0) {
      void postBatch(live.map((h) => buildFix(h.f, h.index, false)), `LIVE ${live.length}`);
    }
  }, [postBatch, buildFix, flushHeld]);

  const finish = useCallback((): void => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    flushHeld(); // anything buffered to the very end backfills now
    setStatusBoth('done');
    appendLog({ kind: 'info', label: 'REPLAY', text: 'Track exhausted — running the schedule sweep to evaluate gaps.' });
    void runWatchdog('auto');
  }, [flushHeld, setStatusBoth, appendLog, runWatchdog]);

  // Keep the RAF step pointing at the latest closures.
  stepRef.current = () => {
    if (statusRef.current !== 'running') return;
    const now = performance.now();
    const dt = now - lastFrameRef.current;
    lastFrameRef.current = now;
    simMsRef.current = Math.min(simMsRef.current + dt * speedRef.current, endMsRef.current);
    processCrossed();
    setSimMs(simMsRef.current);
    if (simMsRef.current >= endMsRef.current) finish();
  };

  useEffect(() => {
    if (status !== 'running') return;
    lastFrameRef.current = performance.now();
    let raf = 0;
    const loop = () => {
      stepRef.current();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [status]);

  // ── Controls ──────────────────────────────────────────────────────────────
  const selected = tracks.find((t) => t.key === selectedKey) ?? null;
  const injectorsLive = status === 'running' || status === 'paused';

  async function startReplay(): Promise<void> {
    if (!selected) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/replay/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ route_id: selected.route_id, vehicle_id: selected.vehicle_id }),
      });
      const json = (await res.json()) as { trip_id?: string; error?: string; message?: string };
      if (!res.ok || !json.trip_id) {
        setError(`${json.error ?? res.status}: ${json.message ?? 'Could not create replay trip'}`);
        return;
      }
      // Reset the engine for a fresh run.
      tripIdRef.current = json.trip_id;
      fixesRef.current = selected.fixes;
      endMsRef.current = trackEndMs(selected);
      baseTimeRef.current = Date.now();
      simMsRef.current = 0;
      nextIdxRef.current = 0;
      heldRef.current = [];
      gpsOffRef.current = false;
      netDropRef.current = false;
      finishedRef.current = false;
      speedRef.current = speed;
      setTripId(json.trip_id);
      setSimMs(0);
      setGpsOff(false);
      setNetDrop(false);
      setLog([]);
      logIdRef.current = 0;
      appendLog({ kind: 'info', label: 'REPLAY', text: `Trip created — streaming “${selected.name}” as REPLAY.` });
      setStatusBoth('running');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function setSpeedBoth(n: 1 | 5 | 20): void {
    speedRef.current = n;
    setSpeed(n);
  }

  function togglePause(): void {
    if (status === 'running') setStatusBoth('paused');
    else if (status === 'paused') setStatusBoth('running');
  }

  function seek(v: number): void {
    if (v > simMsRef.current) {
      simMsRef.current = Math.min(v, endMsRef.current);
      setSimMs(simMsRef.current);
    }
    // Backward seek is ignored: posts are irreversible (this is a real ingest path).
  }

  function toggleGps(): void {
    const next = !gpsOffRef.current;
    gpsOffRef.current = next;
    setGpsOff(next);
    appendLog({ kind: 'info', label: 'INJECT', text: next ? 'GPS OFF — device stops recording (no buffer).' : 'GPS back ON.' });
  }

  function startNetDrop(): void {
    netDropRef.current = true;
    setNetDrop(true);
    appendLog({ kind: 'info', label: 'INJECT', text: 'Network drop — fixes are buffered on-device, nothing sent.' });
  }

  function reconnect(): void {
    netDropRef.current = false;
    setNetDrop(false);
    flushHeld();
    appendLog({ kind: 'info', label: 'INJECT', text: 'Reconnect — buffered fixes backfilled (buffered:true) → COVERAGE_GAP.' });
  }

  async function fireSos(): Promise<void> {
    const trip = tripIdRef.current;
    if (!trip) return;
    try {
      const res = await fetch('/api/trip/sos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trip_id: trip, role: 'driver' }),
      });
      const json = (await res.json()) as { alert_id?: string; error?: string; message?: string };
      if (!res.ok) {
        appendLog({ kind: 'error', label: 'SOS', text: `${json.error ?? res.status}: ${json.message ?? ''}` });
        return;
      }
      appendLog({ kind: 'info', label: 'SOS', text: `CRITICAL alert raised (${json.alert_id ?? 'ok'}).` });
    } catch (e) {
      appendLog({ kind: 'error', label: 'SOS', text: (e as Error).message });
    }
  }

  const routeName = selected ? routeLabels[selected.route_id] ?? selected.route_id : '';
  const vehicleName = selected ? vehicleLabels[selected.vehicle_id] ?? selected.vehicle_id : '';
  const endMs = selected ? trackEndMs(selected) : 0;
  const progress = endMs > 0 ? Math.min(100, (simMs / endMs) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Header — REPLAY chip is ALWAYS visible. Never hide replay. */}
      <div className="flex flex-wrap items-center gap-3 rounded-ops border border-sig-info/40 bg-sig-info/[0.05] px-3 py-2">
        <Chip variant="replay">REPLAY</Chip>
        <p className="text-12 leading-relaxed text-ink-300">
          Every fix below is POSTed to the same{' '}
          <code className="font-mono text-ink-200">/api/telemetry/batch</code> endpoint the phone
          uses, flagged <span className="text-ink-200">source:REPLAY</span>. The harness is not a
          mock — the server runs the real ingest, alert, and evidence pipeline on this data.
        </p>
      </div>

      {error && (
        <div className="rounded-ops border border-sig-alert/50 bg-sig-alert/[0.06] px-3 py-2 text-12 text-sig-alert">
          {error}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        {/* LEFT: track + playback + injectors */}
        <div className="flex flex-col gap-5">
          <Panel
            title="Track"
            subtitle="The harness only replays data recorded on disk — it never invents a bus."
          >
            <div className="flex flex-col gap-1.5">
              {tracks.map((t) => {
                const active = t.key === selectedKey;
                const buf = bufferedCount(t);
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setSelectedKey(t.key)}
                    className={`flex flex-col gap-1 rounded-ops border px-3 py-2 text-left transition-colors ${
                      active
                        ? 'border-sig-info/50 bg-sig-info/[0.06]'
                        : 'border-ink-700 bg-ink-950/40 hover:border-ink-600'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Radio
                        size={13}
                        strokeWidth={1.75}
                        className={active ? 'text-sig-info' : 'text-ink-600'}
                        aria-hidden
                      />
                      <span className="text-13 font-medium text-ink-100">{t.name}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pl-5">
                      <span className="tnum text-11 text-ink-400">{t.fixes.length} fixes</span>
                      {buf > 0 && (
                        <span className="tnum text-11 text-sig-info">{buf} buffered</span>
                      )}
                      <span className="text-11 text-ink-500">· {scenarioHint(t.key)}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-ink-700 pt-3">
              <Button variant="primary" onClick={startReplay} disabled={!selected || busy}>
                <PlayCircle size={14} strokeWidth={1.75} aria-hidden />
                {busy ? 'Starting…' : status === 'idle' ? 'Start replay' : 'Restart replay'}
              </Button>
              {selected && (
                <span className="text-11 text-ink-500">
                  {routeName} · {vehicleName}
                </span>
              )}
            </div>

            {tripId && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-ops border border-ink-700 bg-ink-950/40 px-3 py-2">
                <Chip variant="replay">REPLAY TRIP</Chip>
                <span className="tnum text-11 text-ink-300">{tripId}</span>
                <Link
                  href={`/school/trip/${tripId}`}
                  className="ml-auto inline-flex items-center gap-1 text-12 text-sig-info hover:underline"
                >
                  Open live trip <ArrowRight size={13} strokeWidth={1.75} aria-hidden />
                </Link>
              </div>
            )}
          </Panel>

          <Panel
            title="Playback"
            actions={
              <div className="flex items-center gap-1">
                {([1, 5, 20] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSpeedBoth(n)}
                    className={`tnum rounded-ops border px-2 py-1 text-11 font-medium transition-colors ${
                      speed === n
                        ? 'border-sig-info/50 bg-sig-info/[0.1] text-ink-100'
                        : 'border-ink-700 text-ink-400 hover:border-ink-600'
                    }`}
                  >
                    {n}×
                  </button>
                ))}
              </div>
            }
          >
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                onClick={togglePause}
                disabled={status !== 'running' && status !== 'paused'}
              >
                {status === 'running' ? (
                  <>
                    <Pause size={14} strokeWidth={1.75} aria-hidden /> Pause
                  </>
                ) : (
                  <>
                    <Play size={14} strokeWidth={1.75} aria-hidden /> Resume
                  </>
                )}
              </Button>
              <div className="tnum text-13 text-ink-200">
                {mmss(simMs)} <span className="text-ink-600">/</span>{' '}
                <span className="text-ink-400">{mmss(endMs)}</span>
              </div>
              <div className="ml-auto flex items-center gap-1.5 text-11 text-ink-500">
                <Gauge size={13} strokeWidth={1.75} aria-hidden />
                <span className="tnum">
                  sim clock {fmtTime(new Date(baseTimeRef.current + simMs).toISOString())}
                </span>
              </div>
            </div>

            <div className="mt-3">
              <div className="h-1.5 w-full overflow-hidden rounded-ops bg-ink-800">
                <div
                  className="h-full bg-sig-info transition-[width] duration-100"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={endMs || 1}
                step={1000}
                value={simMs}
                onChange={(e) => seek(Number(e.target.value))}
                disabled={status === 'idle'}
                className="mt-2 w-full accent-sig-info"
                aria-label="Playback position (forward-only — replay posts are irreversible)"
              />
              <p className="mt-1 text-11 text-ink-500">
                Scrub is forward-only. This is the real ingest path — a fix, once posted, cannot be
                un-sent.
              </p>
            </div>
          </Panel>

          <Panel title="Injectors" subtitle="Bend the live playback to force each detector. Most vivid on the clean track.">
            <div className="flex flex-wrap gap-2">
              <Button variant={gpsOff ? 'danger' : 'ghost'} onClick={toggleGps} disabled={!injectorsLive}>
                <WifiOff size={14} strokeWidth={1.75} aria-hidden />
                {gpsOff ? 'GPS is OFF' : 'GPS off'}
              </Button>
              <Button variant={netDrop ? 'danger' : 'ghost'} onClick={startNetDrop} disabled={!injectorsLive || netDrop}>
                <Cable size={14} strokeWidth={1.75} aria-hidden />
                Network drop
              </Button>
              <Button variant="quiet" onClick={reconnect} disabled={!injectorsLive || !netDrop}>
                <Cable size={14} strokeWidth={1.75} aria-hidden />
                Reconnect (backfill)
              </Button>
              <Button variant="danger" onClick={fireSos} disabled={!injectorsLive}>
                <Siren size={14} strokeWidth={1.75} aria-hidden />
                SOS
              </Button>
            </div>

            <div className="mt-3 border-t border-ink-700 pt-3">
              <p className="mb-2 text-11 uppercase tracking-[0.06em] text-ink-500">
                Load a pre-made scenario track
              </p>
              <div className="flex flex-wrap gap-2">
                {tracks
                  .filter((t) => t.key.includes('overspeed') || t.key.includes('deviation'))
                  .map((t) => (
                    <Button key={t.key} variant="quiet" onClick={() => setSelectedKey(t.key)}>
                      {t.key.includes('overspeed') ? 'Overspeed track' : 'Deviation track'}
                    </Button>
                  ))}
              </div>
              <p className="mt-2 text-11 leading-relaxed text-ink-500">
                Overspeed and deviation are driven by their recorded tracks — select one, then press
                Start replay. No synthetic long-stop or noise-storm track ships; we would rather show
                nothing than fabricate a recording that never happened.
              </p>
            </div>

            <div className="mt-3 border-t border-ink-700 pt-3">
              <Button variant="primary" onClick={() => runWatchdog('manual')}>
                <RefreshCw size={14} strokeWidth={1.75} aria-hidden />
                Run schedule sweep
              </Button>
              <p className="mt-2 text-11 text-ink-500">
                Re-evaluates the active trip so a held gap resolves to COVERAGE_GAP, and an
                unbuffered hole resolves to SIGNAL_TAMPER.
              </p>
            </div>
          </Panel>
        </div>

        {/* RIGHT: live ingest log */}
        <Panel
          title="Ingest log"
          subtitle="Every batch shows the server's own response — watch alerts appear."
          bodyClassName="p-0"
        >
          {log.length === 0 ? (
            <EmptyState icon={<Radio size={26} strokeWidth={1.5} />} title="Nothing streamed yet">
              Start a replay and each posted batch will report the server's{' '}
              <span className="tnum">inserted / alerts / new_alerts</span> here. Silence means the
              server has seen nothing — by design, not by omission.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-ink-800">
              {log.map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-3 py-1.5">
                  <span className="tnum shrink-0 text-11 text-ink-600">{fmtTime(e.ts)}</span>
                  {e.kind === 'batch' ? (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-12">
                      <span className="text-11 font-medium uppercase tracking-[0.04em] text-ink-400">
                        {e.label}
                      </span>
                      <span className="tnum text-ink-300">+{e.inserted} fixes</span>
                      <span className="tnum text-ink-400">{e.alerts} alerts</span>
                      {e.new_alerts > 0 && (
                        <span className="tnum font-medium text-sig-watch">
                          +{e.new_alerts} new
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-baseline gap-x-2 text-12">
                      <span
                        className={`text-11 font-medium uppercase tracking-[0.04em] ${
                          e.kind === 'error' ? 'text-sig-alert' : 'text-ink-400'
                        }`}
                      >
                        {e.label}
                      </span>
                      <span className={e.kind === 'error' ? 'text-sig-alert' : 'text-ink-300'}>
                        {e.text}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

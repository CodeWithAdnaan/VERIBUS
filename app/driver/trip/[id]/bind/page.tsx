'use client';
// Bind the phone to the vehicle (BUILD SPEC §9). The driver scans (here: pastes)
// the in-bus QR sticker. The server recomputes the HMAC and rejects a wrong
// vehicle or a bad token. This kills "phone left at school" and "wrong bus".
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import { PublicShell } from '@/components/shell/PublicShell';
import { Button } from '@/components/ui/Button';
import { PilotGap } from '@/components/ui/PilotGap';

interface Coords {
  lat: number;
  lng: number;
}

export default function BindPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [scan, setScan] = useState('');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Best-effort location so the server can flag a bind that happens far from any
  // route stop (a geofence signal). Never blocks the bind if location is denied.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCoords(null),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  async function submit() {
    const value = scan.trim();
    if (!value) {
      setError('Paste the VERIBUS1 code from the in-bus sticker first.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/trip/bind', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          trip_id: id,
          scan: value,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (res.ok) {
        router.push(`/driver/trip/${id}/precheck`);
        return;
      }
      if (body.error === 'WRONG_VEHICLE') {
        setError('This sticker belongs to a different bus than the one assigned to this trip. Check you are on the right vehicle.');
      } else if (body.error === 'BIND_INVALID') {
        setError('The code did not verify. Re-copy the full VERIBUS1 value from the sticker and try again.');
      } else {
        setError(body.message ?? 'Bind failed. Try again.');
      }
    } catch {
      setError('Network error. Check your signal and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicShell title="Bind phone to the bus" back={{ href: '/driver', label: 'Trips' }}>
      <div className="flex flex-col gap-4">
        <div className="rounded-counter border border-ink-300 bg-paper-2 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck size={22} strokeWidth={1.5} className="mt-0.5 shrink-0 text-sig-info" aria-hidden />
            <div>
              <p className="text-16 font-medium text-ink-900">Scan the in-bus QR to bind this phone to the vehicle.</p>
              <p className="mt-1 text-14 leading-relaxed text-ink-600">
                The sticker proves you are physically on the assigned bus. The code starts with{' '}
                <span className="tnum font-mono">VERIBUS1:</span>.
              </p>
            </div>
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-12 font-medium uppercase tracking-[0.06em] text-ink-500">Scanned code</span>
          <textarea
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            placeholder="VERIBUS1:…"
            rows={3}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="tnum w-full resize-none rounded-ops border border-ink-400 bg-white px-3 py-2 font-mono text-14 text-ink-900 outline-none focus:border-sig-info"
          />
        </label>

        {error && (
          <div className="flex items-start gap-2 rounded-ops border border-sig-alert/50 bg-sig-alert/10 px-3 py-2 text-14 text-sig-alert">
            <AlertTriangle size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        )}

        <Button
          variant="primary"
          onClick={submit}
          disabled={submitting}
          className="min-h-[56px] w-full text-16"
        >
          {submitting ? 'Binding…' : 'Bind vehicle'}
        </Button>

        <p className="text-12 leading-relaxed text-ink-500">
          For the demo, the exact VERIBUS1 value for this bus is printed on the school{' '}
          <span className="font-medium text-ink-700">Fleet</span> page next to the vehicle.
        </p>

        <PilotGap title="Camera QR scanning">
          Live camera capture of the sticker needs native camera permissions that the pilot browser
          build does not guarantee. Pasting the VERIBUS1 code is the guaranteed path and verifies the
          same HMAC; a native wrapper can add the camera later without changing the check.
        </PilotGap>
      </div>
    </PublicShell>
  );
}

import QRCode from 'qrcode';
import { headers } from 'next/headers';
import { requireProfile } from '@/lib/server/auth';
import { serviceClient } from '@/lib/supabase/server';
import { stickerPayload } from '@/lib/server/bind';
import { DOCUMENT_CHIP } from '@/lib/adapters/documentSource';
import { Panel } from '@/components/ui/Panel';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { PilotGap } from '@/components/ui/PilotGap';
import { isExpired, daysUntil, fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

interface Vehicle {
  id: string;
  bus_code: string;
  registration_no: string;
  capacity: number;
  speed_governor_fitted: boolean;
  bind_secret: string;
  fitness_expiry: string | null;
  permit_expiry: string | null;
  insurance_expiry: string | null;
  puc_expiry: string | null;
}

function DocField({ label, date }: { label: string; date: string | null }) {
  const expired = isExpired(date);
  const d = daysUntil(date);
  const variant = expired ? 'alert' : d != null && d <= 30 ? 'watch' : 'ok';
  return (
    <div className="rounded-ops border border-ink-700 bg-ink-950/40 p-2">
      <div className="flex items-center justify-between">
        <span className="text-11 uppercase tracking-wide text-ink-500">{label}</span>
        <Chip variant={variant}>{expired ? 'EXPIRED' : d != null && d <= 30 ? `${d}d left` : 'valid'}</Chip>
      </div>
      <div className="tnum mt-1 text-13 text-ink-100">{fmtDate(date)}</div>
      <Chip variant="manual" className="mt-1">{DOCUMENT_CHIP}</Chip>
    </div>
  );
}

export default async function FleetPage() {
  const profile = await requireProfile(['school_admin']);
  try {
    const client = serviceClient();
    const [{ data: vRaw }, { data: drivers }] = await Promise.all([
      client.from('vehicles').select('id, bus_code, registration_no, capacity, speed_governor_fitted, bind_secret, fitness_expiry, permit_expiry, insurance_expiry, puc_expiry').eq('school_id', profile.school_id).order('bus_code'),
      client.from('drivers').select('full_name, phone, licence_no, licence_expiry, active').eq('school_id', profile.school_id).order('full_name'),
    ]);
    const vehicles = (vRaw ?? []) as Vehicle[];

    // Build the app origin from the request host so the QR opens on a phone.
    // NEXT_PUBLIC_SITE_URL pins it if you don't want to rely on the Host header;
    // otherwise load this page via the PC's LAN IP (e.g. http://192.168.x.x:3001).
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
    const proto = h.get('x-forwarded-proto') ?? 'http';
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? `${proto}://${host}`;

    // A bus with a completed evidence chain gets a PUBLIC verify QR: scanning it
    // from any phone (incl. on Vercel over HTTPS) opens /verify/<hash>, a no-login
    // SHA-256 integrity check. Buses without one keep the driver bind-scan QR.
    const { data: chRows } = await client
      .from('trips')
      .select('vehicle_id, chain_head')
      .eq('school_id', profile.school_id);
    const verifyHash = new Map<string, string>();
    for (const t of (chRows ?? []) as { vehicle_id: string; chain_head: string | null }[]) {
      if (t.chain_head && !verifyHash.has(t.vehicle_id)) verifyHash.set(t.vehicle_id, t.chain_head);
    }

    const scanUrl = (v: Vehicle) =>
      `${origin}/driver/scan?c=${encodeURIComponent(stickerPayload(v.id, v.bind_secret))}`;
    const qrs = await Promise.all(
      vehicles.map((v) => {
        const head = verifyHash.get(v.id);
        const target = head ? `${origin}/verify/${head}` : scanUrl(v);
        return QRCode.toDataURL(target, { margin: 1, width: 140 }).catch(() => '');
      })
    );

    if (vehicles.length === 0) return <EmptyState title="No vehicles for this school." />;

    return (
      <div className="space-y-4">
        <PilotGap id="departmental-feeds" />
        {vehicles.map((v, i) => (
          <Panel
            key={v.id}
            title={v.bus_code}
            subtitle={`${v.registration_no} · ${v.capacity} seats · governor ${v.speed_governor_fitted ? 'fitted' : 'not fitted'}`}
            actions={<Chip variant="manual">doc source: MANUAL_ENTRY</Chip>}
          >
            <div className="grid gap-4 md:grid-cols-[1fr_160px]">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <DocField label="Fitness" date={v.fitness_expiry} />
                <DocField label="Permit" date={v.permit_expiry} />
                <DocField label="Insurance" date={v.insurance_expiry} />
                <DocField label="PUC" date={v.puc_expiry} />
              </div>
              <div className="text-center">
                <div className="text-11 uppercase tracking-wide text-ink-500">In-bus QR (bind sticker)</div>
                {qrs[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrs[i]} alt={`Bind QR for ${v.bus_code}`} className="mx-auto mt-1 rounded bg-white p-1" width={140} height={140} />
                ) : (
                  <div className="mt-1 text-11 text-ink-500">QR unavailable</div>
                )}
                {verifyHash.get(v.id) ? (
                  <div className="mt-1 text-11 font-medium text-sig-ok">Scan to verify evidence — SHA-256, public</div>
                ) : (
                  <div className="mt-1 text-11 font-medium text-viz-1">Scan to bind (driver)</div>
                )}
                <div className="tnum mt-1 break-all text-[10px] text-ink-500">{stickerPayload(v.id, v.bind_secret)}</div>
              </div>
            </div>
          </Panel>
        ))}

        <Panel title="Drivers">
          <table className="w-full text-12">
            <thead className="text-11 uppercase text-ink-500">
              <tr className="border-b border-ink-700 text-left">
                <th className="py-1 pr-2">Name</th>
                <th className="py-1 pr-2">Phone</th>
                <th className="py-1 pr-2">Licence</th>
                <th className="py-1 pr-2">Expiry</th>
                <th className="py-1 pr-2">Active</th>
              </tr>
            </thead>
            <tbody>
              {(drivers ?? []).map((d, i) => (
                <tr key={i} className="border-b border-ink-800">
                  <td className="py-1.5 pr-2 text-ink-100">{d.full_name as string}</td>
                  <td className="py-1.5 pr-2 tnum text-ink-400">{d.phone as string}</td>
                  <td className="py-1.5 pr-2 tnum text-ink-400">{d.licence_no as string}</td>
                  <td className="py-1.5 pr-2 tnum text-ink-400">
                    {isExpired(d.licence_expiry as string) ? <span className="text-sig-alert">{fmtDate(d.licence_expiry as string)}</span> : fmtDate(d.licence_expiry as string)}
                  </td>
                  <td className="py-1.5 pr-2">{d.active ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    );
  } catch {
    return <EmptyState title="Fleet unavailable">Confirm the Supabase connection.</EmptyState>;
  }
}

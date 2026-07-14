// QR scan landing (BUILD SPEC §9). The in-bus QR on the school Fleet page encodes
//   <origin>/driver/scan?c=VERIBUS1:<vehicleId>:<hmac>
// A phone's native camera opens this URL. We re-derive the bind HMAC (never trust the
// client), find the driver's pending trip on that bus, mark it bound, append a BIND
// evidence record, and send the driver straight to pre-check. Paste-to-bind still works
// on the bind page as a fallback.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { QrCode, ShieldAlert, Bus } from 'lucide-react';
import { currentProfile } from '@/lib/supabase/session';
import { serviceClient } from '@/lib/supabase/server';
import { parseScan, verifyStickerToken } from '@/lib/server/bind';
import { appendEvidence } from '@/lib/server/evidence';
import { PublicShell } from '@/components/shell/PublicShell';
import { EmptyState } from '@/components/ui/EmptyState';

export const dynamic = 'force-dynamic';

function ScanError({ title, children, icon }: { title: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <PublicShell title="Scan bus QR" back={{ href: '/driver', label: 'My trips' }}>
      <div className="rounded-counter border border-ink-300 bg-paper-2 p-1">
        <EmptyState title={title} icon={icon ?? <ShieldAlert size={26} strokeWidth={1.5} />}>
          {children}
        </EmptyState>
      </div>
    </PublicShell>
  );
}

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  const scan = (c ?? '').trim();

  // Not signed in (or wrong role) → send through login and return here afterwards.
  const profile = await currentProfile();
  const nextPath = `/driver/scan?c=${encodeURIComponent(scan)}`;
  if (!profile) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (profile.role !== 'driver') {
    return (
      <ScanError title="Sign in as the driver to bind" icon={<QrCode size={26} strokeWidth={1.5} />}>
        You&rsquo;re signed in as a different role.{' '}
        <Link href={`/login?next=${encodeURIComponent(nextPath)}`} className="underline hover:text-ink-800">
          Sign in as the driver
        </Link>{' '}
        on this phone, then scan again.
      </ScanError>
    );
  }

  const parsed = parseScan(scan);
  if (!parsed) {
    return (
      <ScanError title="QR not recognised">
        That code isn&rsquo;t a VERIBUS bind sticker. Scan the QR printed for this bus on the school
        Fleet page, or paste the code on the bind screen.
      </ScanError>
    );
  }

  const client = serviceClient();

  const { data: driver } = await client.from('drivers').select('id').eq('user_id', profile.id).maybeSingle();
  if (!driver) {
    return (
      <ScanError title="This account is not linked to a driver">
        Ask your school administrator to link your login to your driver record.
      </ScanError>
    );
  }

  const { data: veh } = await client
    .from('vehicles')
    .select('id, bind_secret, bus_code')
    .eq('id', parsed.vehicleId)
    .maybeSingle();
  if (!veh || !verifyStickerToken(veh.id, veh.bind_secret, parsed.token)) {
    return (
      <ScanError title="Sticker did not verify">
        This QR could not be verified for a bus in the system. Try scanning again, or use the paste
        option on the bind screen.
      </ScanError>
    );
  }

  // The driver's pending trip on THIS bus (soonest first).
  const { data: trips } = await client
    .from('trips')
    .select('id, status, bind_verified')
    .eq('driver_id', driver.id)
    .eq('vehicle_id', parsed.vehicleId)
    .in('status', ['SCHEDULED', 'PRE_CHECK', 'ACTIVE'])
    .order('planned_start', { ascending: true });

  const trip = ((trips ?? []) as { id: string; status: string; bind_verified: boolean }[])[0];
  if (!trip) {
    return (
      <ScanError title="No pending trip for this bus" icon={<Bus size={26} strokeWidth={1.5} />}>
        You have no trip on <span className="tnum">{veh.bus_code}</span> to bind right now. Open{' '}
        <Link href="/driver" className="underline hover:text-ink-800">
          My trips
        </Link>{' '}
        to see what&rsquo;s assigned.
      </ScanError>
    );
  }

  // Bind (idempotent) + evidence, then route to the next step.
  try {
    if (!trip.bind_verified) {
      await client.from('trips').update({ bind_verified: true }).eq('id', trip.id);
      await appendEvidence(client, trip.id, 'BIND', {
        vehicle_id: veh.id,
        bus_code: veh.bus_code,
        source: 'qr-scan',
      });
    }
  } catch {
    // If evidence append fails, the bind flag is still set; continue to pre-check.
  }

  const dest = trip.status === 'ACTIVE' ? 'run' : 'precheck';
  redirect(`/driver/trip/${trip.id}/${dest}`);
}

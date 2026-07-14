// Pre-check gate (BUILD SPEC §9). A checklist that cannot block anything is
// decoration — so a failed BLOCKING item stops the trip and is written to the
// evidence chain. This runs as a server component (it must read precheck_items,
// which is not exposed to the browser) with a server action that submits both
// the pre-check and, on a pass, the start gate. No client JS is required, so it
// works even on a weak phone.
export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { AlertOctagon, AlertTriangle, ClipboardCheck } from 'lucide-react';
import { requireProfile } from '@/lib/server/auth';
import { serviceClient } from '@/lib/supabase/server';
import { PublicShell } from '@/components/shell/PublicShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { Chip } from '@/components/ui/Chip';

interface PrecheckItem {
  code: string;
  label: string;
  blocking: boolean;
  seq: number;
}

async function baseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export default async function PrecheckPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ blocked?: string; failed?: string; error?: string; msg?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const profile = await requireProfile(['driver']);

  let items: PrecheckItem[] = [];
  let tripFound = false;
  let driverId: string | undefined;
  let loadError = false;

  try {
    const client = serviceClient();
    const { data: trip } = await client
      .from('trips')
      .select('id, school_id, status')
      .eq('id', id)
      .maybeSingle();
    if (trip) {
      tripFound = true;
      const { data: driver } = await client
        .from('drivers')
        .select('id')
        .eq('user_id', profile.id)
        .maybeSingle();
      driverId = driver?.id;
      const { data: rows } = await client
        .from('precheck_items')
        .select('code, label, blocking, seq')
        .or(`school_id.is.null,school_id.eq.${trip.school_id}`)
        .order('seq', { ascending: true });
      items = (rows ?? []) as PrecheckItem[];
    }
  } catch {
    loadError = true;
  }

  // Server action: capture the loaded items + ids, submit the pre-check, and on a
  // clean pass advance through the start gate to Trip Mode. redirect() throws a
  // control-flow signal, so it is only ever called OUTSIDE the fetch try/catch.
  async function submit(formData: FormData) {
    'use server';
    const answers = items.map((item) => ({
      item_code: item.code,
      ok: formData.get(`item_${item.code}`) === 'pass',
    }));

    const base = await baseUrl();
    const jsonHeaders = { 'content-type': 'application/json' };

    let pcOk = false;
    let pc: { passed?: boolean; failed_blocking?: string[]; error?: string; message?: string } = {};
    try {
      const res = await fetch(`${base}/api/trip/precheck`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ trip_id: id, performed_by: driverId, answers }),
        cache: 'no-store',
      });
      pcOk = res.ok;
      pc = await res.json();
    } catch {
      pc = { error: 'NETWORK', message: 'Could not reach the server. Try again.' };
    }
    if (!pcOk) {
      redirect(`/driver/trip/${id}/precheck?error=${pc.error ?? 'PRECHECK_ERROR'}&msg=${encodeURIComponent(pc.message ?? 'Pre-check failed.')}`);
    }
    if (!pc.passed) {
      redirect(`/driver/trip/${id}/precheck?blocked=1&failed=${encodeURIComponent((pc.failed_blocking ?? []).join(','))}`);
    }

    let stOk = false;
    let st: { error?: string; message?: string } = {};
    try {
      const res = await fetch(`${base}/api/trip/start`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ trip_id: id }),
        cache: 'no-store',
      });
      stOk = res.ok;
      st = await res.json();
    } catch {
      st = { error: 'NETWORK', message: 'Could not reach the server. Try again.' };
    }
    if (!stOk) {
      redirect(`/driver/trip/${id}/precheck?error=${st.error ?? 'START_BLOCKED'}&msg=${encodeURIComponent(st.message ?? 'Trip could not start.')}`);
    }

    redirect(`/driver/trip/${id}/run`);
  }

  if (loadError || !tripFound) {
    return (
      <PublicShell title="Pre-check" back={{ href: '/driver', label: 'Trips' }}>
        <div className="rounded-counter border border-ink-300 bg-paper-2 p-1">
          <EmptyState title={tripFound ? 'Pre-check is unavailable right now' : 'Trip not found'}>
            {tripFound
              ? 'We could not load the checklist. Nothing is stored on this phone — reopen the trip from your list to try again.'
              : 'This trip is not on your list. Go back and open a trip assigned to you today.'}
          </EmptyState>
        </div>
      </PublicShell>
    );
  }

  if (items.length === 0) {
    return (
      <PublicShell title="Pre-check" back={{ href: '/driver', label: 'Trips' }}>
        <div className="rounded-counter border border-ink-300 bg-paper-2 p-1">
          <EmptyState title="No pre-check items configured">
            Your school has not set up a safety checklist yet. Ask the administrator to add pre-check
            items before this trip can start.
          </EmptyState>
        </div>
      </PublicShell>
    );
  }

  const blockedCodes = sp.blocked ? (sp.failed ? sp.failed.split(',').filter(Boolean) : []) : [];

  return (
    <PublicShell title="Safety pre-check" back={{ href: '/driver', label: 'Trips' }}>
      <div className="mb-4 flex items-start gap-3 rounded-counter border border-ink-300 bg-paper-2 p-4">
        <ClipboardCheck size={22} strokeWidth={1.5} className="mt-0.5 shrink-0 text-sig-info" aria-hidden />
        <p className="text-14 leading-relaxed text-ink-700">
          Mark each item. A failed <span className="font-medium">blocking</span> item stops the trip
          and notifies your school — this is the gate, not a formality.
        </p>
      </div>

      {sp.blocked && (
        <div className="mb-4 rounded-counter border border-sig-alert bg-sig-alert/10 p-4">
          <div className="flex items-center gap-2 text-16 font-semibold text-sig-alert">
            <AlertOctagon size={20} strokeWidth={1.75} aria-hidden />
            Trip blocked
          </div>
          <p className="mt-1.5 text-14 leading-relaxed text-ink-700">
            A blocking safety check failed
            {blockedCodes.length > 0 && (
              <>
                {' '}(<span className="tnum font-mono">{blockedCodes.join(', ')}</span>)
              </>
            )}
            . This trip cannot start and your school has been notified. Fix the fault, then submit the
            pre-check again.
          </p>
        </div>
      )}

      {sp.error && (
        <div className="mb-4 flex items-start gap-2 rounded-counter border border-sig-alert/50 bg-sig-alert/10 px-4 py-3 text-14 text-sig-alert">
          <AlertTriangle size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            <span className="font-mono font-semibold">{sp.error}</span>
            {sp.msg ? ` — ${sp.msg}` : null}
          </span>
        </div>
      )}

      <form action={submit} className="flex flex-col gap-3">
        {items.map((item) => (
          <fieldset key={item.code} className="rounded-counter border border-ink-300 bg-paper-2 p-3">
            <legend className="sr-only">{item.label}</legend>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-14 font-medium text-ink-900">{item.label}</span>
              {item.blocking && <Chip variant="alert">Blocking</Chip>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="cursor-pointer">
                <input type="radio" name={`item_${item.code}`} value="pass" required className="peer sr-only" />
                <span className="flex min-h-[56px] items-center justify-center rounded-ops border border-ink-400 bg-white text-16 font-semibold text-ink-600 peer-checked:border-sig-ok peer-checked:bg-sig-ok/10 peer-checked:text-sig-ok">
                  Pass
                </span>
              </label>
              <label className="cursor-pointer">
                <input type="radio" name={`item_${item.code}`} value="fail" className="peer sr-only" />
                <span className="flex min-h-[56px] items-center justify-center rounded-ops border border-ink-400 bg-white text-16 font-semibold text-ink-600 peer-checked:border-sig-alert peer-checked:bg-sig-alert/10 peer-checked:text-sig-alert">
                  Fail
                </span>
              </label>
            </div>
          </fieldset>
        ))}

        <button
          type="submit"
          className="min-h-[56px] w-full rounded-counter border border-transparent bg-sig-info text-16 font-semibold text-white transition-colors hover:brightness-[1.08]"
        >
          Submit pre-check and start
        </button>
      </form>
    </PublicShell>
  );
}

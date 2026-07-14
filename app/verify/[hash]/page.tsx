import { ShieldCheck, ShieldAlert, SearchX, Info } from 'lucide-react';
import { serviceClient } from '@/lib/supabase/server';
import { findTripByChainHash, verifyTripChain } from '@/lib/server/evidence';
import { fmtDate, shortHash } from '@/lib/format';
import { ChainVerify } from '@/components/charts/ChainVerify';

// PUBLIC evidence verification. No login, NO personal data. This is exactly what the
// QR on a printed inspection memo points to: it can prove a trip's evidence chain is
// intact (or that it was altered) without ever revealing a name, a place, or a child.
export const dynamic = 'force-dynamic';

type VerifyState =
  | { kind: 'valid'; recordCount: number; tripDate: string | null }
  | { kind: 'tampered'; recordCount: number; brokenAtSeq: number | null; tripDate: string | null }
  | { kind: 'not_found' }
  | { kind: 'error' };

async function resolve(hash: string): Promise<VerifyState> {
  try {
    const client = serviceClient();

    // 1) The hash usually IS an evidence record hash (and chain_head is the last one).
    let tripId: string | null = null;
    const rec = (await findTripByChainHash(client, hash)) as { trip_id?: string } | null;
    if (rec?.trip_id) tripId = rec.trip_id;

    // 2) Fallback: a memo may encode the trip's chain_head cursor directly.
    if (!tripId) {
      const { data: byHead } = await client
        .from('trips')
        .select('id')
        .eq('chain_head', hash)
        .maybeSingle();
      const head = byHead as { id?: string } | null;
      if (head?.id) tripId = head.id;
    }

    if (!tripId) return { kind: 'not_found' };

    const verdict = await verifyTripChain(client, tripId);

    const { data: trip } = await client
      .from('trips')
      .select('started_at, ended_at')
      .eq('id', tripId)
      .maybeSingle();
    const t = trip as { started_at: string | null; ended_at: string | null } | null;
    const tripDate = t?.started_at ?? t?.ended_at ?? null;

    return verdict.valid
      ? { kind: 'valid', recordCount: verdict.record_count, tripDate }
      : {
          kind: 'tampered',
          recordCount: verdict.record_count,
          brokenAtSeq: verdict.broken_at_seq,
          tripDate,
        };
  } catch {
    return { kind: 'error' };
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-ink-700 py-2 first:border-t-0">
      <span className="text-11 uppercase tracking-[0.08em] text-ink-400">{label}</span>
      <span className="tnum text-14 text-ink-100">{value}</span>
    </div>
  );
}

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = await params;
  const state = await resolve(hash);

  return (
    <main className="min-h-screen bg-ink-950 px-4 py-12">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-5">
          <p className="text-11 font-medium uppercase tracking-[0.12em] text-ink-400">
            Evidence chain verification
          </p>
          <p className="mt-1 text-12 leading-relaxed text-ink-400">
            A public integrity check. No names, no locations, no personal data — only whether
            this trip&apos;s evidence has been altered.
          </p>
        </header>

        <section className="overflow-hidden rounded-ops border border-ink-700 bg-ink-900">
          {state.kind === 'tampered' && <div className="hazard-band h-2 w-full" aria-hidden />}

          {state.kind === 'valid' && (
            <div className="p-5">
              <div className="flex items-center gap-2 text-sig-ok">
                <ShieldCheck size={22} strokeWidth={1.75} aria-hidden />
                <span className="text-16 font-semibold">Chain valid</span>
              </div>
              <p className="mt-2 text-12 leading-relaxed text-ink-300">
                Every record recomputes to its stored hash. This trip&apos;s evidence chain is
                intact and has not been altered since it was recorded.
              </p>
              <ChainVerify recordCount={state.recordCount} />
              <div className="mt-4">
                <Row label="Records" value={String(state.recordCount)} />
                <Row label="Trip date" value={fmtDate(state.tripDate)} />
              </div>
            </div>
          )}

          {state.kind === 'tampered' && (
            <div className="p-5">
              <div className="flex items-center gap-2 text-sig-alert">
                <ShieldAlert size={22} strokeWidth={1.75} aria-hidden />
                <span className="text-16 font-semibold">Chain tampered</span>
              </div>
              <p className="mt-2 text-12 leading-relaxed text-ink-300">
                A record no longer matches its cryptographic hash. The evidence chain for this
                trip has been altered and cannot be trusted.
              </p>
              <ChainVerify recordCount={state.recordCount} brokenAtSeq={state.brokenAtSeq} />
              <div className="mt-4">
                <Row label="Records" value={String(state.recordCount)} />
                <Row
                  label="Broken at record"
                  value={state.brokenAtSeq === null ? '—' : `#${state.brokenAtSeq}`}
                />
                <Row label="Trip date" value={fmtDate(state.tripDate)} />
              </div>
            </div>
          )}

          {state.kind === 'not_found' && (
            <div className="p-5">
              <div className="flex items-center gap-2 text-ink-200">
                <SearchX size={22} strokeWidth={1.75} aria-hidden />
                <span className="text-16 font-semibold">Hash not found</span>
              </div>
              <p className="mt-2 text-12 leading-relaxed text-ink-400">
                No evidence record matches this hash. Re-check the code printed on the memo — a
                single altered character will not resolve, by design.
              </p>
            </div>
          )}

          {state.kind === 'error' && (
            <div className="p-5">
              <div className="flex items-center gap-2 text-ink-200">
                <Info size={22} strokeWidth={1.75} aria-hidden />
                <span className="text-16 font-semibold">Verification unavailable</span>
              </div>
              <p className="mt-2 text-12 leading-relaxed text-ink-400">
                The verification service could not be reached. No data is shown rather than a
                guess. Please try again shortly.
              </p>
            </div>
          )}

          <div className="border-t border-ink-700 px-5 py-3">
            <p className="text-11 uppercase tracking-[0.08em] text-ink-500">Queried hash</p>
            <p className="tnum mt-1 break-all text-12 text-ink-300" title={hash}>
              {shortHash(hash, 10, 10)}
            </p>
          </div>
        </section>

        <p className="mt-4 text-11 leading-relaxed text-ink-500">
          Anyone holding the memo can run this check. It reveals only the integrity verdict —
          never who was on the bus or where it went.
        </p>
      </div>
    </main>
  );
}

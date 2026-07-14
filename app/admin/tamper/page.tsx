// DEV-ONLY tamper tool. Deliberately corrupts one evidence record's payload — while
// leaving its stored record_hash untouched — so the chain verifier flags it. This proves
// tamper is *detectable*, not that it is possible in the real product: evidence is
// append-only and RLS forbids UPDATE. This page is unmistakably a demo instrument.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { TriangleAlert, ExternalLink, ShieldOff } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { serviceClient } from '@/lib/supabase/server';
import { shortHash, fmtDateTime } from '@/lib/format';

interface TripRow {
  id: string;
  route_id: string;
  vehicle_id: string;
  status: string;
  started_at: string | null;
}
interface EvRec {
  trip_id: string;
  seq: number;
  kind: string;
  record_hash: string;
  payload: unknown;
}

const isTampered = (payload: unknown): boolean =>
  !!payload && typeof payload === 'object' && !Array.isArray(payload) && '_tampered' in payload;

// ── Server action: corrupt one record (gated) ────────────────────────────────
async function corruptRecord(formData: FormData): Promise<void> {
  'use server';
  if (process.env.NODE_ENV === 'production') return;
  const tripId = String(formData.get('trip_id') ?? '');
  const seq = Number(formData.get('seq'));
  if (!tripId || !Number.isFinite(seq)) return;
  try {
    const client = serviceClient();
    const { data: rec } = await client
      .from('evidence_records')
      .select('payload')
      .eq('trip_id', tripId)
      .eq('seq', seq)
      .maybeSingle();
    if (!rec) return;
    const base: Record<string, unknown> =
      rec.payload && typeof rec.payload === 'object' && !Array.isArray(rec.payload)
        ? { ...(rec.payload as Record<string, unknown>) }
        : { original: rec.payload };
    base._tampered = {
      at: new Date().toISOString(),
      by: 'demo-tamper-tool',
      note: 'payload mutated in place; stored record_hash left unchanged so the chain fails verification',
    };
    // Update ONLY payload — record_hash stays stale, so recompute ≠ stored → broken chain.
    await client.from('evidence_records').update({ payload: base }).eq('trip_id', tripId).eq('seq', seq);
  } catch {
    /* demo tool — swallow and let the page re-render */
  }
  revalidatePath('/admin/tamper');
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function TamperPage() {
  if (process.env.NODE_ENV === 'production') {
    return (
      <Panel title="Tamper tool">
        <EmptyState icon={<ShieldOff size={26} strokeWidth={1.5} />} title="Disabled in production">
          This is a development-only demonstration tool. Evidence records are append-only and
          protected by row-level security — nothing in the product can edit one.
        </EmptyState>
      </Panel>
    );
  }

  let trips: TripRow[] = [];
  const recsByTrip = new Map<string, EvRec[]>();
  const routeLabels: Record<string, string> = {};
  const vehicleLabels: Record<string, string> = {};
  let loadFailed = false;

  try {
    const client = serviceClient();
    const { data: t } = await client
      .from('trips')
      .select('id, route_id, vehicle_id, status, started_at')
      .order('started_at', { ascending: false, nullsFirst: false })
      .limit(8);
    trips = (t ?? []) as TripRow[];

    const tripIds = trips.map((x) => x.id);
    if (tripIds.length > 0) {
      const [{ data: recs }, { data: routes }, { data: vehicles }] = await Promise.all([
        client
          .from('evidence_records')
          .select('trip_id, seq, kind, record_hash, payload')
          .in('trip_id', tripIds)
          .order('seq', { ascending: true }),
        client.from('routes').select('id, name').in('id', [...new Set(trips.map((x) => x.route_id))]),
        client
          .from('vehicles')
          .select('id, bus_code, registration_no')
          .in('id', [...new Set(trips.map((x) => x.vehicle_id))]),
      ]);
      for (const r of (recs ?? []) as EvRec[]) {
        const list = recsByTrip.get(r.trip_id) ?? [];
        list.push(r);
        recsByTrip.set(r.trip_id, list);
      }
      for (const r of routes ?? []) routeLabels[r.id as string] = (r.name as string) ?? (r.id as string);
      for (const v of vehicles ?? [])
        vehicleLabels[v.id as string] =
          (v.bus_code as string) ?? (v.registration_no as string) ?? (v.id as string);
    }
  } catch {
    loadFailed = true;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Unmistakable demo banner — hazard stripe + solid panel so text stays legible. */}
      <div className="overflow-hidden rounded-ops border border-sig-alert/50 bg-ink-900">
        <div className="hazard-band h-2 w-full" aria-hidden />
        <div className="flex items-start gap-2 px-4 py-3">
          <TriangleAlert size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-sig-alert" aria-hidden />
          <div>
            <p className="text-13 font-bold uppercase tracking-[0.06em] text-ink-100">
              Demo tool — not part of the product
            </p>
            <p className="mt-0.5 text-12 leading-relaxed text-ink-300">
              This screen edits an evidence record's payload in place to show the chain catches it.
              In the real system evidence is append-only and RLS blocks UPDATE — this capability
              exists only here, only in development.
            </p>
          </div>
        </div>
      </div>

      {loadFailed || trips.length === 0 ? (
        <Panel title="Trips">
          <EmptyState title="No trips to tamper with">
            Evidence records appear here only after a trip has produced them. Nothing between trips —
            by design. Run a replay first, then come back to break its chain.
          </EmptyState>
        </Panel>
      ) : (
        trips.map((trip) => {
          const recs = recsByTrip.get(trip.id) ?? [];
          const routeName = routeLabels[trip.route_id] ?? trip.route_id;
          const vehicleName = vehicleLabels[trip.vehicle_id] ?? trip.vehicle_id;
          return (
            <Panel
              key={trip.id}
              title={`${routeName} · ${vehicleName}`}
              subtitle={`${trip.status} · started ${fmtDateTime(trip.started_at)}`}
              actions={
                <div className="flex items-center gap-2">
                  <a
                    href={`/api/evidence/verify?trip_id=${trip.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-12 text-sig-info hover:underline"
                  >
                    Verify chain <ExternalLink size={12} strokeWidth={1.75} aria-hidden />
                  </a>
                  <Link href="/verify" className="text-12 text-ink-400 hover:text-ink-200 hover:underline">
                    /verify
                  </Link>
                </div>
              }
              bodyClassName="p-0"
            >
              {recs.length === 0 ? (
                <div className="px-3 py-3 text-12 text-ink-500">
                  This trip has no evidence records yet.
                </div>
              ) : (
                <ul className="divide-y divide-ink-800">
                  {recs.map((r) => {
                    const tampered = isTampered(r.payload);
                    return (
                      <li
                        key={`${r.trip_id}-${r.seq}`}
                        className={`flex flex-wrap items-center gap-3 px-3 py-2 ${
                          tampered ? 'bg-sig-alert/[0.06]' : ''
                        }`}
                      >
                        <span className="tnum w-8 shrink-0 text-11 text-ink-500">#{r.seq}</span>
                        <span className="w-40 shrink-0 text-12 text-ink-200">{r.kind}</span>
                        <span className="tnum text-11 text-ink-500">{shortHash(r.record_hash)}</span>
                        {tampered && <Chip variant="alert">TAMPERED (demo)</Chip>}
                        <form action={corruptRecord} className="ml-auto">
                          <input type="hidden" name="trip_id" value={r.trip_id} />
                          <input type="hidden" name="seq" value={r.seq} />
                          <Button variant="danger" type="submit" disabled={tampered}>
                            {tampered ? 'Corrupted' : 'Corrupt payload'}
                          </Button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          );
        })
      )}
    </div>
  );
}

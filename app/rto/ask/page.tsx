import Link from 'next/link';
import { Panel } from '@/components/ui/Panel';
import { Chip } from '@/components/ui/Chip';
import { Hash } from '@/components/ui/Hash';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { requireProfile } from '@/lib/server/auth';
import { serviceClient } from '@/lib/supabase/server';
import { fmtDateTime } from '@/lib/format';
import { AlertTriangle, Sparkles, X } from 'lucide-react';

export const dynamic = 'force-dynamic';

const ALERT_TYPES = [
  'OVERSPEED',
  'LONG_STOP',
  'ROUTE_DEVIATION',
  'DELAY',
  'SIGNAL_LOST',
  'SOS',
  'REPEAT_COMPLAINT',
  'TRIP_NOT_STARTED',
];

interface AlertResult {
  id: string;
  vehicle_id: string;
  type: string;
  confidence: string;
  started_at: string;
  summary: string;
  evidence_id: string | null;
}

function normalize(
  sp: Record<string, string | string[] | undefined>
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    out[k] = Array.isArray(v) ? v.filter((x) => x !== '') : v === '' ? [] : [v];
  }
  return out;
}

function hrefWithout(params: Record<string, string[]>, key: string, val?: string): string {
  const usp = new URLSearchParams();
  for (const [k, vals] of Object.entries(params)) {
    for (const v of vals) {
      if (k === key && (val === undefined || v === val)) continue;
      usp.append(k, v);
    }
  }
  const qs = usp.toString();
  return qs ? `/rto/ask?${qs}` : '/rto/ask';
}

export default async function RtoAskPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireProfile(['rto_officer']);
  const sp = await searchParams;
  const params = normalize(sp);

  const selVehicle = params.vehicle?.[0] ?? '';
  const selTypes = params.type ?? [];
  const minCount = Math.max(1, parseInt(params.min?.[0] ?? '1', 10) || 1);
  const selConf = params.conf?.[0] ?? '';
  const from = params.from?.[0] ?? '';
  const to = params.to?.[0] ?? '';

  let vehicles: { id: string; bus_code: string }[] = [];
  let results: AlertResult[] = [];
  let failed = false;

  try {
    const client = serviceClient();
    const { data: vs } = await client.from('rto_vehicle_summary').select('id, bus_code');
    vehicles = ((vs ?? []) as { id: string; bus_code: string }[]).sort((a, b) =>
      a.bus_code.localeCompare(b.bus_code)
    );

    let q = client
      .from('alerts')
      .select('id, vehicle_id, type, confidence, started_at, summary, evidence_id');
    if (selVehicle) q = q.eq('vehicle_id', selVehicle);
    if (selTypes.length > 0) q = q.in('type', selTypes);
    if (selConf) q = q.eq('confidence', selConf);
    if (from) q = q.gte('started_at', from);
    if (to) q = q.lte('started_at', `${to}T23:59:59`);
    const { data } = await q.order('started_at', { ascending: false }).limit(500);
    let rows = (data ?? []) as AlertResult[];

    // Apply the minimum-count filter per vehicle.
    if (minCount > 1) {
      const counts = new Map<string, number>();
      for (const r of rows) counts.set(r.vehicle_id, (counts.get(r.vehicle_id) ?? 0) + 1);
      rows = rows.filter((r) => (counts.get(r.vehicle_id) ?? 0) >= minCount);
    }
    results = rows;
  } catch {
    failed = true;
  }

  const busCode: Record<string, string> = {};
  vehicles.forEach((v) => (busCode[v.id] = v.bus_code));

  // Active filter chips (removable).
  const chips: { label: string; href: string }[] = [];
  if (selVehicle)
    chips.push({ label: `Vehicle: ${busCode[selVehicle] ?? selVehicle}`, href: hrefWithout(params, 'vehicle') });
  for (const t of selTypes)
    chips.push({ label: `Type: ${t}`, href: hrefWithout(params, 'type', t) });
  if (params.min && minCount > 1)
    chips.push({ label: `Min count: ${minCount}`, href: hrefWithout(params, 'min') });
  if (selConf) chips.push({ label: `Confidence: ${selConf}`, href: hrefWithout(params, 'conf') });
  if (from) chips.push({ label: `From: ${from}`, href: hrefWithout(params, 'from') });
  if (to) chips.push({ label: `To: ${to}`, href: hrefWithout(params, 'to') });

  return (
    <div className="space-y-6">
      {/* Deferred natural-language input */}
      <Panel title="Ask" subtitle="Natural-language filtering is deferred for the pilot.">
        <div className="flex items-center gap-2 opacity-60">
          <Sparkles size={16} strokeWidth={1.5} className="text-ink-500" aria-hidden />
          <input
            type="text"
            disabled
            placeholder="e.g. buses with 3+ high-confidence overspeed alerts this month"
            className="w-full cursor-not-allowed rounded-ops border border-ink-800 bg-ink-950 px-3 py-2 text-14 text-ink-500 outline-none"
          />
          <Button variant="quiet" disabled type="button">
            Ask
          </Button>
        </div>
        <p className="mt-2 text-12 leading-relaxed text-ink-400">
          Natural-language filtering is deferred — the model would output ONLY a strict JSON filter
          object (never SQL, never the answer), shown as removable chips before the query runs. Use the
          filters below.
        </p>
      </Panel>

      {/* Manual filter form */}
      <Panel title="Filters" subtitle="Build a query by hand. Every active filter is shown as a removable chip.">
        <form method="get" action="/rto/ask" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-12">
              <span className="text-ink-400">Vehicle</span>
              <select
                name="vehicle"
                defaultValue={selVehicle}
                className="mt-1 w-full rounded-ops border border-ink-700 bg-ink-950 px-2 py-1.5 text-14 text-ink-100 outline-none focus:border-sig-info"
              >
                <option value="">Any vehicle</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.bus_code}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-12">
              <span className="text-ink-400">Confidence</span>
              <select
                name="conf"
                defaultValue={selConf}
                className="mt-1 w-full rounded-ops border border-ink-700 bg-ink-950 px-2 py-1.5 text-14 text-ink-100 outline-none focus:border-sig-info"
              >
                <option value="">Any</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </label>
            <label className="block text-12">
              <span className="text-ink-400">Min alerts per vehicle</span>
              <input
                name="min"
                type="number"
                min={1}
                step={1}
                defaultValue={minCount}
                className="tnum mt-1 w-full rounded-ops border border-ink-700 bg-ink-950 px-2 py-1.5 text-14 text-ink-100 outline-none focus:border-sig-info"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-12">
                <span className="text-ink-400">From</span>
                <input
                  name="from"
                  type="date"
                  defaultValue={from}
                  className="tnum mt-1 w-full rounded-ops border border-ink-700 bg-ink-950 px-2 py-1.5 text-13 text-ink-100 outline-none focus:border-sig-info"
                />
              </label>
              <label className="block text-12">
                <span className="text-ink-400">To</span>
                <input
                  name="to"
                  type="date"
                  defaultValue={to}
                  className="tnum mt-1 w-full rounded-ops border border-ink-700 bg-ink-950 px-2 py-1.5 text-13 text-ink-100 outline-none focus:border-sig-info"
                />
              </label>
            </div>
          </div>

          <fieldset className="text-12">
            <legend className="text-ink-400">Alert types</legend>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
              {ALERT_TYPES.map((t) => (
                <label key={t} className="inline-flex items-center gap-1.5 text-ink-200">
                  <input
                    type="checkbox"
                    name="type"
                    value={t}
                    defaultChecked={selTypes.includes(t)}
                    className="accent-sig-info"
                  />
                  <span className="tnum text-11">{t}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex items-center gap-3">
            <Button variant="primary" type="submit">
              Run filter
            </Button>
            <Link href="/rto/ask" className="text-12 text-ink-400 hover:text-ink-200">
              Clear all
            </Link>
          </div>
        </form>
      </Panel>

      {/* Active chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-11 uppercase tracking-[0.08em] text-ink-500">Active filters</span>
          {chips.map((c, i) => (
            <Link key={i} href={c.href} className="group">
              <span className="inline-flex items-center gap-1 rounded-ops border border-ink-600 bg-ink-950/40 px-1.5 py-0.5 text-11 font-medium text-ink-200 group-hover:border-sig-info">
                {c.label}
                <X size={12} strokeWidth={2} aria-hidden className="text-ink-500 group-hover:text-sig-info" />
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Results */}
      <Panel title="Results" subtitle="Aggregated alert records only — never the raw track.">
        {failed ? (
          <EmptyState title="Results unavailable" icon={<AlertTriangle size={28} strokeWidth={1.5} />}>
            The query could not run. This surface reads only alert summaries — no raw location is ever
            queried here.
          </EmptyState>
        ) : results.length === 0 ? (
          <EmptyState title="No alerts match these filters">
            Nothing matched. An empty result is not missing data — the RTO surface only ever holds
            compliance summaries, by design.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-13">
              <thead>
                <tr className="border-b border-ink-700 text-left text-11 uppercase tracking-[0.06em] text-ink-500">
                  <th className="py-2 pr-3 font-medium">Vehicle</th>
                  <th className="py-2 pr-3 font-medium">Type</th>
                  <th className="py-2 pr-3 font-medium">Confidence</th>
                  <th className="py-2 pr-3 font-medium">Started</th>
                  <th className="py-2 pr-3 font-medium">Summary</th>
                  <th className="py-2 font-medium">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id} className="border-b border-ink-800 hover:bg-ink-800/50">
                    <td className="py-2 pr-3">
                      <Link
                        href={`/rto/vehicle/${r.vehicle_id}`}
                        className="tnum text-ink-100 underline decoration-ink-700 underline-offset-2 hover:decoration-sig-info"
                      >
                        {busCode[r.vehicle_id] ?? '—'}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      <Chip variant={r.confidence === 'HIGH' ? 'watch' : 'neutral'}>{r.type}</Chip>
                    </td>
                    <td className="tnum py-2 pr-3 text-ink-300">{r.confidence}</td>
                    <td className="tnum py-2 pr-3 text-ink-400">{fmtDateTime(r.started_at)}</td>
                    <td className="min-w-0 max-w-xs truncate py-2 pr-3 text-ink-300">{r.summary}</td>
                    <td className="py-2">
                      <Hash value={r.evidence_id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

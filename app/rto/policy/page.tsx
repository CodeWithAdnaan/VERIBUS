import { revalidatePath } from 'next/cache';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PilotGap } from '@/components/ui/PilotGap';
import { requireProfile } from '@/lib/server/auth';
import { serviceClient } from '@/lib/supabase/server';
import { getActivePolicy } from '@/lib/server/policy';
import { speedPolicyBanner } from '@/lib/engine/policy';
import type { PolicyRules } from '@/lib/engine/types';
import { AlertTriangle, ShieldAlert, Info } from 'lucide-react';

export const dynamic = 'force-dynamic';

// Deduction weights the officer may edit. COVERAGE_GAP is deliberately excluded here
// and pinned to 0 in the action — a driver is never punished for the network.
const EDITABLE_WEIGHTS: { key: string; label: string }[] = [
  { key: 'TRIP_NOT_STARTED', label: 'Trip not started' },
  { key: 'SIGNAL_TAMPER', label: 'Signal tamper' },
  { key: 'ROUTE_DEVIATION', label: 'Route deviation' },
  { key: 'OVERSPEED', label: 'Overspeed' },
  { key: 'COMPLAINT_UPHELD', label: 'Upheld complaint' },
  { key: 'LONG_STOP', label: 'Long stop' },
  { key: 'PRECHECK_FAILED_BLOCKING', label: 'Pre-check failed (blocking)' },
  { key: 'DOC_EXPIRED', label: 'Document expired' },
];

function num(fd: FormData, name: string, fallback: number | null): number | null {
  const raw = fd.get(name);
  if (raw === null || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function nextVersion(versions: string[]): string {
  let max = 0;
  for (const v of versions) {
    const g = /_v(\d+)$/.exec(v)?.[1];
    if (g) max = Math.max(max, parseInt(g, 10));
  }
  return `RTO_JK_v${max + 1}`;
}

async function savePolicy(formData: FormData) {
  'use server';
  const client = serviceClient();
  const active = await getActivePolicy(client);
  const rules: PolicyRules = JSON.parse(JSON.stringify(active.rules));

  rules.speed.default_limit_kmh = num(formData, 'default_limit_kmh', rules.speed.default_limit_kmh);
  rules.speed.school_zone_limit_kmh = num(
    formData,
    'school_zone_limit_kmh',
    rules.speed.school_zone_limit_kmh
  );
  rules.speed.limit_source = String(formData.get('limit_source') ?? '').trim() || 'UNSET';
  rules.speed.tolerance_kmh = num(formData, 'tolerance_kmh', rules.speed.tolerance_kmh) ?? rules.speed.tolerance_kmh;
  rules.speed.sustained_seconds =
    num(formData, 'sustained_seconds', rules.speed.sustained_seconds) ?? rules.speed.sustained_seconds;

  const deductions: Record<string, number> = { ...rules.scoring.deductions };
  for (const { key } of EDITABLE_WEIGHTS) {
    const v = num(formData, `ded_${key}`, deductions[key] ?? 0);
    deductions[key] = v ?? 0;
  }
  deductions.COVERAGE_GAP = 0; // invariant: never punish a driver for the network
  rules.scoring.deductions = deductions;

  const { data: all } = await client.from('policy_config').select('version');
  const version = nextVersion(((all ?? []) as { version: string }[]).map((r) => r.version));
  const today = new Date().toISOString().slice(0, 10);

  await client.from('policy_config').update({ is_active: false }).eq('is_active', true);
  await client
    .from('policy_config')
    .insert({ version, effective_from: today, is_active: true, rules });

  revalidatePath('/rto/policy');
}

export default async function RtoPolicyPage() {
  await requireProfile(['rto_officer']);

  let active: Awaited<ReturnType<typeof getActivePolicy>> | null = null;
  try {
    active = await getActivePolicy(serviceClient());
  } catch {
    active = null;
  }

  if (!active) {
    return (
      <Panel title="Policy">
        <EmptyState title="No active policy loaded" icon={<AlertTriangle size={28} strokeWidth={1.5} />}>
          The active policy configuration could not be read. Without a policy the engine keeps
          overspeed evaluation disabled — the system never asserts a speed limit on its own authority.
        </EmptyState>
      </Panel>
    );
  }

  const rules = active.rules;
  const banner = speedPolicyBanner(rules);
  const bannerStyle =
    banner.level === 'disabled'
      ? { cls: 'border-sig-alert/50 bg-sig-alert/[0.08] text-sig-alert', Icon: ShieldAlert }
      : banner.level === 'demo'
        ? { cls: 'border-sig-watch/50 bg-sig-watch/[0.08] text-sig-watch', Icon: AlertTriangle }
        : { cls: 'border-ink-700 bg-ink-900 text-ink-200', Icon: Info };
  const BannerIcon = bannerStyle.Icon;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-20 font-semibold text-ink-100">Policy</h1>
          <p className="text-12 text-ink-400">
            Active version{' '}
            <span className="tnum font-semibold text-ink-200">{active.version}</span>. The engine reads
            policy from here — never from constants.
          </p>
        </div>
      </div>

      {/* Speed policy banner */}
      <div className={`flex items-start gap-3 rounded-ops border px-4 py-3 text-13 ${bannerStyle.cls}`}>
        <BannerIcon size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
        <p className="leading-relaxed">{banner.message}</p>
      </div>

      <form action={savePolicy} className="space-y-6">
        {/* Speed limit */}
        <Panel
          title="Speed limit"
          subtitle="The system does not assert a legal limit on its own authority — cite the source."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-12">
              <span className="text-ink-400">Default limit (km/h)</span>
              <input
                name="default_limit_kmh"
                type="number"
                min={0}
                step={1}
                defaultValue={rules.speed.default_limit_kmh ?? ''}
                className="tnum mt-1 w-full rounded-ops border border-ink-700 bg-ink-950 px-2 py-1.5 text-14 text-ink-100 outline-none focus:border-sig-info"
              />
            </label>
            <label className="block text-12">
              <span className="text-ink-400">School-zone limit (km/h)</span>
              <input
                name="school_zone_limit_kmh"
                type="number"
                min={0}
                step={1}
                defaultValue={rules.speed.school_zone_limit_kmh ?? ''}
                className="tnum mt-1 w-full rounded-ops border border-ink-700 bg-ink-950 px-2 py-1.5 text-14 text-ink-100 outline-none focus:border-sig-info"
              />
            </label>
            <label className="block text-12 sm:col-span-2">
              <span className="text-ink-400">
                Limit source (required — cite a departmental circular; empty or UNSET disables
                overspeed evaluation)
              </span>
              <input
                name="limit_source"
                type="text"
                required
                defaultValue={rules.speed.limit_source}
                placeholder="e.g. RTO Srinagar circular no. …/2026"
                className="mt-1 w-full rounded-ops border border-ink-700 bg-ink-950 px-2 py-1.5 text-14 text-ink-100 outline-none focus:border-sig-info"
              />
            </label>
            <label className="block text-12">
              <span className="text-ink-400">Tolerance (km/h)</span>
              <input
                name="tolerance_kmh"
                type="number"
                min={0}
                step={1}
                defaultValue={rules.speed.tolerance_kmh}
                className="tnum mt-1 w-full rounded-ops border border-ink-700 bg-ink-950 px-2 py-1.5 text-14 text-ink-100 outline-none focus:border-sig-info"
              />
            </label>
            <label className="block text-12">
              <span className="text-ink-400">Sustained seconds</span>
              <input
                name="sustained_seconds"
                type="number"
                min={0}
                step={1}
                defaultValue={rules.speed.sustained_seconds}
                className="tnum mt-1 w-full rounded-ops border border-ink-700 bg-ink-950 px-2 py-1.5 text-14 text-ink-100 outline-none focus:border-sig-info"
              />
            </label>
          </div>
          <div className="mt-4">
            <PilotGap id="verified-speed-segments" />
          </div>
        </Panel>

        {/* Deduction weights */}
        <Panel
          title="Deduction weights"
          subtitle="Defeating the system must cost more than the violations it detects."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {EDITABLE_WEIGHTS.map((w) => (
              <label key={w.key} className="block text-12">
                <span className="text-ink-400">{w.label}</span>
                <input
                  name={`ded_${w.key}`}
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={rules.scoring.deductions[w.key] ?? 0}
                  className="tnum mt-1 w-full rounded-ops border border-ink-700 bg-ink-950 px-2 py-1.5 text-14 text-ink-100 outline-none focus:border-sig-info"
                />
              </label>
            ))}
            <label className="block text-12">
              <span className="text-ink-400">Coverage gap</span>
              <input
                type="number"
                value={0}
                disabled
                readOnly
                className="tnum mt-1 w-full cursor-not-allowed rounded-ops border border-ink-800 bg-ink-900 px-2 py-1.5 text-14 text-ink-500 outline-none"
              />
              <span className="mt-1 block text-11 text-ink-500">
                Always 0 — a driver is never punished for the network.
              </span>
            </label>
          </div>
        </Panel>

        <div className="flex items-center gap-3">
          <Button variant="primary" type="submit">
            Save as new version
          </Button>
          <span className="text-11 text-ink-500">
            Saving inserts a new immutable <span className="tnum">policy_config</span> version and
            activates it; prior versions are retained.
          </span>
        </div>
      </form>

      {/* The argument, made visible */}
      <Panel title="Why the weights are ordered this way">
        <p className="text-13 leading-relaxed text-ink-200">
          Defeating the system is penalised more heavily than the violations it detects.
          TRIP_NOT_STARTED (8) and SIGNAL_TAMPER (6) outweigh OVERSPEED (4). If evading monitoring were
          cheaper than complying, no driver would ever overspeed — they would simply switch off the
          app. COVERAGE_GAP carries zero penalty, because a driver must never be punished for
          Kashmir's network.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-13">
            <thead>
              <tr className="border-b border-ink-700 text-left text-11 uppercase tracking-[0.06em] text-ink-500">
                <th className="py-2 pr-3 font-medium">Deduction class</th>
                <th className="py-2 text-right font-medium">Current weight</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(rules.scoring.deductions).map(([k, v]) => (
                <tr key={k} className="border-b border-ink-800">
                  <td className="py-1.5 pr-3 text-ink-200">{k}</td>
                  <td
                    className={`tnum py-1.5 text-right ${
                      v === 0 ? 'text-sig-unmonitored' : 'text-ink-100'
                    }`}
                  >
                    {v}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

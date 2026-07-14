import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/server/auth';
import { serviceClient } from '@/lib/supabase/server';
import { Panel } from '@/components/ui/Panel';
import { Chip, type ChipVariant } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { fmtDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

const sevRank: Record<string, number> = { CRITICAL: 0, WARN: 1, INFO: 2 };
const sevChip = (s: string): ChipVariant => (s === 'CRITICAL' ? 'critical' : s === 'WARN' ? 'watch' : 'info');

async function handleAlert(formData: FormData) {
  'use server';
  const profile = await requireProfile(['school_admin']);
  const client = serviceClient();
  const alertId = String(formData.get('alert_id') ?? '');
  const intent = String(formData.get('intent') ?? '');
  const note = String(formData.get('note') ?? '').trim();

  const { data: alert } = await client
    .from('alerts')
    .select('id, school_id, type, status')
    .eq('id', alertId)
    .single();
  if (!alert || alert.school_id !== profile.school_id) redirect('/school/alerts?err=not_found');

  // SOS never auto-resolves and requires a written note to acknowledge/resolve.
  if (alert!.type === 'SOS' && (intent === 'ack' || intent === 'resolve') && !note) {
    redirect('/school/alerts?err=sos_note_required');
  }

  const patch: Record<string, unknown> = {};
  if (intent === 'ack') {
    patch.status = 'ACKNOWLEDGED';
    patch.acknowledged_by = profile.id;
    patch.acknowledged_at = new Date().toISOString();
    if (note) patch.resolution_note = note;
  } else if (intent === 'resolve') {
    patch.status = 'RESOLVED';
    patch.resolution_note = note || null;
  } else if (intent === 'dismiss') {
    patch.status = 'DISMISSED';
    patch.resolution_note = note || null;
  } else {
    redirect('/school/alerts?err=bad_intent');
  }
  await client.from('alerts').update(patch).eq('id', alertId);
  revalidatePath('/school/alerts');
}

interface Row {
  id: string;
  type: string;
  subtype: string | null;
  severity: string;
  confidence: string;
  status: string;
  started_at: string;
  summary: string;
  vehicles: { bus_code: string } | null;
}

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const profile = await requireProfile(['school_admin']);
  const { err } = await searchParams;

  let rows: Row[] = [];
  try {
    const client = serviceClient();
    const { data } = await client
      .from('alerts')
      .select('id, type, subtype, severity, confidence, status, started_at, summary, vehicles(bus_code)')
      .eq('school_id', profile.school_id)
      .order('started_at', { ascending: false })
      .limit(300);
    rows = ((data ?? []) as unknown as Row[]).sort(
      (a, b) => (sevRank[a.severity] ?? 3) - (sevRank[b.severity] ?? 3)
    );
  } catch {
    return <EmptyState title="Alerts unavailable">Confirm the Supabase connection.</EmptyState>;
  }

  return (
    <Panel title="Alert triage" subtitle="Criticals first. SOS requires a written note and never auto-resolves.">
      {err === 'sos_note_required' && (
        <div className="mb-3 rounded-ops border border-sig-alert/50 bg-sig-alert/[0.06] p-2 text-12 text-sig-alert">
          An SOS cannot be acknowledged or resolved without a written note.
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyState title="No alerts">Nothing to triage. A quiet queue is a compliant fleet.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-12">
            <thead className="text-11 uppercase tracking-wide text-ink-500">
              <tr className="border-b border-ink-700 text-left">
                <th className="py-1 pr-2">Type</th>
                <th className="py-1 pr-2">Vehicle</th>
                <th className="py-1 pr-2">Sev</th>
                <th className="py-1 pr-2">Conf</th>
                <th className="py-1 pr-2">When</th>
                <th className="py-1 pr-2">Status</th>
                <th className="py-1 pr-2">Summary / action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a, i) => {
                const final = ['RESOLVED', 'DISMISSED'].includes(a.status);
                return (
                  <tr
                    key={a.id}
                    className="alert-in border-b border-ink-800 align-top"
                    style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                  >
                    <td className="py-2 pr-2 text-ink-100">
                      {a.type}
                      {a.subtype ? <span className="text-ink-500"> · {a.subtype}</span> : ''}
                    </td>
                    <td className="py-2 pr-2 tnum text-ink-300">{a.vehicles?.bus_code ?? '—'}</td>
                    <td className="py-2 pr-2"><Chip variant={sevChip(a.severity)}>{a.severity}</Chip></td>
                    <td className="py-2 pr-2 tnum text-ink-400">{a.confidence}</td>
                    <td className="py-2 pr-2 tnum text-ink-500">{fmtDateTime(a.started_at)}</td>
                    <td className="py-2 pr-2 text-ink-300">{a.status}</td>
                    <td className="py-2 pr-2">
                      <div className="text-ink-300">{a.summary}</div>
                      {!final && (
                        <form action={handleAlert} className="mt-1 flex flex-wrap items-center gap-1">
                          <input type="hidden" name="alert_id" value={a.id} />
                          <input
                            name="note"
                            placeholder={a.type === 'SOS' ? 'Written note (required for SOS)…' : 'Note (optional)…'}
                            className="w-48 rounded-ops border border-ink-700 bg-ink-950 px-2 py-1 text-11 text-ink-100"
                          />
                          <button name="intent" value="ack" className="rounded-ops border border-ink-600 px-2 py-1 text-11 text-ink-200 hover:bg-ink-800">Acknowledge</button>
                          <button name="intent" value="resolve" className="rounded-ops border border-sig-ok/40 px-2 py-1 text-11 text-sig-ok hover:bg-ink-800">Resolve</button>
                          <button name="intent" value="dismiss" className="rounded-ops border border-ink-600 px-2 py-1 text-11 text-ink-400 hover:bg-ink-800">Dismiss</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

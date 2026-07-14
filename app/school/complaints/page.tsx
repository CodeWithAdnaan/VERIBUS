import { revalidatePath } from 'next/cache';
import { requireProfile } from '@/lib/server/auth';
import { serviceClient } from '@/lib/supabase/server';
import { Panel } from '@/components/ui/Panel';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { fmtDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

async function resolveComplaint(formData: FormData) {
  'use server';
  const profile = await requireProfile(['school_admin']);
  const client = serviceClient();
  const id = String(formData.get('complaint_id') ?? '');
  const intent = String(formData.get('intent') ?? '');
  const category = String(formData.get('category') ?? '').trim() || null;

  const { data: c } = await client.from('complaints').select('id, school_id').eq('id', id).single();
  if (!c || c.school_id !== profile.school_id) return;

  if (intent === 'uphold') {
    await client.from('complaints').update({ upheld: true, status: 'UPHELD', category }).eq('id', id);
  } else if (intent === 'dismiss') {
    await client.from('complaints').update({ upheld: false, status: 'DISMISSED', category }).eq('id', id);
  }
  revalidatePath('/school/complaints');
}

interface Row {
  id: string;
  vehicle_id: string | null;
  category: string | null;
  ai_suggested_category: string | null;
  ai_confidence: number | null;
  body: string;
  photo_path: string | null;
  status: string;
  upheld: boolean | null;
  created_at: string;
  vehicles: { bus_code: string } | null;
}

export default async function ComplaintsPage() {
  const profile = await requireProfile(['school_admin']);
  let rows: Row[] = [];
  try {
    const client = serviceClient();
    const { data } = await client
      .from('complaints')
      .select('id, vehicle_id, category, ai_suggested_category, ai_confidence, body, photo_path, status, upheld, created_at, vehicles(bus_code)')
      .eq('school_id', profile.school_id)
      .order('created_at', { ascending: false })
      .limit(300);
    rows = (data ?? []) as unknown as Row[];
  } catch {
    return <EmptyState title="Complaints unavailable">Confirm the Supabase connection.</EmptyState>;
  }

  // 30-day clusters by (vehicle, effective category) — flag >= 3 (REPEAT_COMPLAINT).
  const cutoff = Date.now() - 30 * 864e5;
  const clusters = new Map<string, number>();
  for (const c of rows) {
    if (!c.vehicle_id || Date.parse(c.created_at) < cutoff) continue;
    const cat = c.category ?? c.ai_suggested_category ?? 'Uncategorised';
    const key = `${c.vehicles?.bus_code ?? c.vehicle_id}|${cat}`;
    clusters.set(key, (clusters.get(key) ?? 0) + 1);
  }
  const flagged = [...clusters.entries()].filter(([, n]) => n >= 3);

  return (
    <div className="space-y-4">
      {flagged.length > 0 && (
        <Panel title="Repeat-complaint clusters (30 days)">
          <ul className="space-y-1">
            {flagged.map(([key, n]) => {
              const [bus, cat] = key.split('|');
              return (
                <li key={key} className="flex items-center gap-2 text-12">
                  <Chip variant="critical">REPEAT ×{n}</Chip>
                  <span className="text-ink-200">{bus}</span>
                  <span className="text-ink-500">· {cat}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <Panel title="Complaint triage" subtitle="Only an upheld complaint deducts score. AI suggestions are advisory and pending human review.">
        {rows.length === 0 ? (
          <EmptyState title="No complaints">Nothing to review.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {rows.map((c) => {
              const open = c.status === 'OPEN';
              return (
                <li key={c.id} className="rounded-ops border border-ink-700 bg-ink-950/40 p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-13 text-ink-100">{c.vehicles?.bus_code ?? 'Unlinked'}</span>
                    {c.ai_suggested_category && (
                      <Chip variant="manual" title="AI-suggested — pending human review">
                        AI-suggested: {c.ai_suggested_category}
                      </Chip>
                    )}
                    <Chip variant={c.upheld ? 'alert' : c.status === 'DISMISSED' ? 'neutral' : 'info'}>{c.status}</Chip>
                    <span className="tnum ml-auto text-11 text-ink-500">{fmtDateTime(c.created_at)}</span>
                  </div>
                  <p className="mt-1 text-12 text-ink-300">{c.body}</p>
                  {c.photo_path && (
                    <p className="mt-1 text-11 text-ink-500">Photo attached — faces blurred client-side before upload.</p>
                  )}
                  {open && (
                    <form action={resolveComplaint} className="mt-2 flex flex-wrap items-center gap-1">
                      <input type="hidden" name="complaint_id" value={c.id} />
                      <input
                        name="category"
                        defaultValue={c.category ?? c.ai_suggested_category ?? ''}
                        placeholder="Confirm category…"
                        className="w-44 rounded-ops border border-ink-700 bg-ink-950 px-2 py-1 text-11 text-ink-100"
                      />
                      <button name="intent" value="uphold" className="rounded-ops border border-sig-alert/40 px-2 py-1 text-11 text-sig-alert hover:bg-ink-800">Uphold (deducts)</button>
                      <button name="intent" value="dismiss" className="rounded-ops border border-ink-600 px-2 py-1 text-11 text-ink-400 hover:bg-ink-800">Dismiss</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

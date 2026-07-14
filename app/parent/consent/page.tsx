// Parent consent & privacy (BUILD SPEC §7, §13). Verifiable parental/guardian consent
// for a child's data is the lawful basis for the live view. WITHDRAW actually stamps
// withdrawn_at = now(), which revokes the live view via RLS — that is the whole point.
import { EyeOff, ShieldCheck } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { requireProfile } from '@/lib/server/auth';
import { serviceClient } from '@/lib/supabase/server';
import { PublicShell } from '@/components/shell/PublicShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { Chip } from '@/components/ui/Chip';
import { fmtDateTime } from '@/lib/format';
import { ConsentActions } from './ConsentActions';

export const dynamic = 'force-dynamic';

// notice_version is a required column. There is no live notice registry in the pilot,
// so we stamp a single placeholder and defer the exact wording to legal review.
const NOTICE_VERSION = 'DPDP_NOTICE_v1';
// TODO(legal): verify exact section reference before submission.

interface ConsentRow {
  id: string;
  guardian_id: string;
  student_id: string;
  granted_at: string | null;
  withdrawn_at: string | null;
}
interface ChildItem {
  studentId: string;
  studentName: string;
  classLabel: string | null;
  guardianId: string;
  consent: ConsentRow | null;
}

/** Re-derive the guardian rows this signed-in user actually owns. Never trust the client. */
async function ownedGuardianIds(userId: string): Promise<string[]> {
  const svc = serviceClient();
  const { data } = await svc.from('guardians').select('id').eq('user_id', userId);
  return ((data ?? []) as { id: string }[]).map((g) => g.id);
}

// ── SERVER ACTION: grant (or re-grant) consent for a child ──
async function grantConsent(consentId: string | null, studentId: string, guardianId: string) {
  'use server';
  const profile = await requireProfile(['parent']);
  const owned = await ownedGuardianIds(profile.id);
  if (!owned.includes(guardianId)) return; // ownership check — silently refuse
  const svc = serviceClient();
  const nowISO = new Date().toISOString();
  if (consentId) {
    await svc.from('consents').update({ granted_at: nowISO, withdrawn_at: null }).eq('id', consentId).eq('guardian_id', guardianId);
  } else {
    await svc.from('consents').insert({
      guardian_id: guardianId,
      student_id: studentId,
      notice_version: NOTICE_VERSION,
      channel: 'APP',
      granted_at: nowISO,
    });
  }
  revalidatePath('/parent/consent');
}

// ── SERVER ACTION: withdraw consent — this REVOKES the live view (RLS) ──
async function withdrawConsent(consentId: string) {
  'use server';
  const profile = await requireProfile(['parent']);
  const owned = await ownedGuardianIds(profile.id);
  const svc = serviceClient();
  // Verify the consent belongs to a guardian this user owns before touching it.
  const { data } = await svc.from('consents').select('id, guardian_id').eq('id', consentId).maybeSingle();
  const row = data as { id: string; guardian_id: string } | null;
  if (!row || !owned.includes(row.guardian_id)) return;
  await svc.from('consents').update({ withdrawn_at: new Date().toISOString() }).eq('id', consentId);
  revalidatePath('/parent/consent');
}

async function loadChildren(userId: string): Promise<ChildItem[]> {
  try {
    const svc = serviceClient();
    const { data: guardians } = await svc.from('guardians').select('id').eq('user_id', userId);
    const guardianIds = ((guardians ?? []) as { id: string }[]).map((g) => g.id);
    if (guardianIds.length === 0) return [];

    const { data: links } = await svc
      .from('guardian_student')
      .select('guardian_id, student_id')
      .in('guardian_id', guardianIds);
    const pairs = (links ?? []) as { guardian_id: string; student_id: string }[];
    if (pairs.length === 0) return [];

    const studentIds = [...new Set(pairs.map((p) => p.student_id))];
    const [{ data: students }, { data: consents }] = await Promise.all([
      svc.from('students').select('id, display_name, class_label').in('id', studentIds),
      svc.from('consents').select('id, guardian_id, student_id, granted_at, withdrawn_at').in('guardian_id', guardianIds),
    ]);
    const studentMap = new Map(
      ((students ?? []) as { id: string; display_name: string; class_label: string | null }[]).map((s) => [s.id, s])
    );
    const consentRows = (consents ?? []) as ConsentRow[];

    return pairs.map((p) => {
      const s = studentMap.get(p.student_id);
      const consent =
        consentRows.find((c) => c.guardian_id === p.guardian_id && c.student_id === p.student_id) ?? null;
      return {
        studentId: p.student_id,
        studentName: s?.display_name ?? 'Child',
        classLabel: s?.class_label ?? null,
        guardianId: p.guardian_id,
        consent,
      };
    });
  } catch {
    return [];
  }
}

function stateOf(c: ConsentRow | null): 'granted' | 'withdrawn' | 'none' {
  if (!c || !c.granted_at) return c?.withdrawn_at ? 'withdrawn' : 'none';
  return c.withdrawn_at ? 'withdrawn' : 'granted';
}

export default async function ConsentPage() {
  const profile = await requireProfile(['parent']);
  const children = await loadChildren(profile.id);

  return (
    <PublicShell title="Consent & privacy" back={{ href: '/parent', label: 'Live view' }}>
      <div className="mb-4 rounded-counter border border-black/10 bg-paper-2 p-3 text-13 leading-relaxed text-ink-700">
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-ink-900">
          <ShieldCheck size={16} strokeWidth={1.75} className="text-sig-info" aria-hidden />
          What you are consenting to
        </p>
        <p>
          The live view relies on your <strong>verifiable parental/guardian consent for your
          child&rsquo;s data</strong>. We track the bus, never the child — there is no location
          stored against your child. You may withdraw at any time; withdrawal immediately closes the
          live view and is honoured by the database itself.
        </p>
      </div>

      {children.length === 0 ? (
        <div className="overflow-hidden rounded-counter border border-ink-700 bg-ink-950">
          <EmptyState icon={<EyeOff size={28} strokeWidth={1.5} />} title="No children on record for this account.">
            We only hold a record where a child is linked to your guardian account. If that seems
            wrong, contact your school — we do not create profiles you have not consented to.
          </EmptyState>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {children.map((item) => {
            const st = stateOf(item.consent);
            return (
              <li
                key={`${item.guardianId}:${item.studentId}`}
                className="rounded-counter border border-black/10 bg-paper-2 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-14 font-semibold text-ink-900">{item.studentName}</p>
                    {item.classLabel && <p className="text-12 text-ink-600">{item.classLabel}</p>}
                  </div>
                  {st === 'granted' && <Chip variant="ok">Consent active</Chip>}
                  {st === 'withdrawn' && <Chip variant="neutral">Withdrawn — live view off</Chip>}
                  {st === 'none' && <Chip variant="unmonitored">No consent on record</Chip>}
                </div>

                {item.consent?.granted_at && st === 'granted' && (
                  <p className="mt-1 text-11 text-ink-500">
                    Granted <span className="tnum">{fmtDateTime(item.consent.granted_at)}</span>
                  </p>
                )}
                {item.consent?.withdrawn_at && st === 'withdrawn' && (
                  <p className="mt-1 text-11 text-ink-500">
                    Withdrawn <span className="tnum">{fmtDateTime(item.consent.withdrawn_at)}</span>
                  </p>
                )}

                <div className="mt-2.5">
                  <ConsentActions
                    active={st === 'granted'}
                    onGrant={grantConsent.bind(null, item.consent?.id ?? null, item.studentId, item.guardianId)}
                    onWithdraw={item.consent?.id ? withdrawConsent.bind(null, item.consent.id) : undefined}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PublicShell>
  );
}

// Parent complaint (BUILD SPEC §7, §13). The guaranteed privacy path is a MANUAL
// face-blur brush on the client — a photo cannot be uploaded until visible faces are
// painted over. Automatic face detection is an explicit PilotGap, not a fake feature.
// This server file guards auth, lists the parent's vehicles, and owns the insert action.
import { requireProfile } from '@/lib/server/auth';
import { serviceClient } from '@/lib/supabase/server';
import { PublicShell } from '@/components/shell/PublicShell';
import { ComplaintForm, type SubmitResult } from './ComplaintForm';

export const dynamic = 'force-dynamic';

const PHOTO_BUCKET = 'complaint-photos';

/** Schools the parent's children belong to → the vehicles it is meaningful to name. */
async function schoolIdsFor(userId: string): Promise<string[]> {
  const svc = serviceClient();
  const { data: guardians } = await svc.from('guardians').select('id').eq('user_id', userId);
  const guardianIds = ((guardians ?? []) as { id: string }[]).map((g) => g.id);
  if (guardianIds.length === 0) return [];
  const { data: links } = await svc.from('guardian_student').select('student_id').in('guardian_id', guardianIds);
  const studentIds = [...new Set(((links ?? []) as { student_id: string }[]).map((l) => l.student_id))];
  if (studentIds.length === 0) return [];
  const { data: students } = await svc.from('students').select('school_id').in('id', studentIds);
  return [...new Set(((students ?? []) as { school_id: string }[]).map((s) => s.school_id))];
}

async function loadVehicles(userId: string): Promise<{ id: string; bus_code: string }[]> {
  try {
    const schoolIds = await schoolIdsFor(userId);
    if (schoolIds.length === 0) return [];
    const svc = serviceClient();
    const { data } = await svc
      .from('vehicles')
      .select('id, bus_code')
      .in('school_id', schoolIds)
      .eq('active', true)
      .order('bus_code');
    return (data ?? []) as { id: string; bus_code: string }[];
  } catch {
    return [];
  }
}

// ── SERVER ACTION: record a complaint. Identity is re-derived here, never trusted
// from the client. The photo arriving here is ALREADY blurred client-side. ──
async function submitComplaint(formData: FormData): Promise<SubmitResult> {
  'use server';
  const profile = await requireProfile(['parent']);
  const svc = serviceClient();

  const category = String(formData.get('category') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  const vehicleId = String(formData.get('vehicleId') ?? '').trim() || null;
  const anonymous = formData.get('anonymous') === 'on';
  if (!body) return { ok: false, error: 'Please describe what happened.' };

  // school_id is required. Prefer the named vehicle's school, else the parent's child's.
  let schoolId: string | null = null;
  if (vehicleId) {
    const { data: v } = await svc.from('vehicles').select('school_id').eq('id', vehicleId).maybeSingle();
    schoolId = (v?.school_id as string) ?? null;
  }
  if (!schoolId) {
    const schoolIds = await schoolIdsFor(profile.id);
    schoolId = schoolIds[0] ?? null;
  }
  if (!schoolId) return { ok: false, error: 'We could not link this complaint to a school. Contact your school directly.' };

  // Optional photo — already redacted on the client. Best-effort upload; degrade to none.
  let photoPath: string | null = null;
  const photo = formData.get('photo');
  if (photo && photo instanceof Blob && photo.size > 0) {
    try {
      const buf = new Uint8Array(await photo.arrayBuffer());
      const path = `${crypto.randomUUID()}.jpg`;
      const { error } = await svc.storage.from(PHOTO_BUCKET).upload(path, buf, {
        contentType: 'image/jpeg',
        upsert: false,
      });
      if (!error) photoPath = path;
    } catch {
      photoPath = null; // storage unavailable — the complaint is still recorded
    }
  }

  try {
    const { error } = await svc.from('complaints').insert({
      school_id: schoolId,
      vehicle_id: vehicleId,
      raised_by: anonymous ? null : profile.id,
      anonymous,
      category: category || null,
      ai_suggested_category: null, // classifier deferred — a human confirms the category
      body,
      photo_path: photoPath,
      status: 'OPEN',
    });
    if (error) return { ok: false, error: 'Could not save the complaint. Please try again.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not save the complaint. Please try again.' };
  }
}

export default async function ComplaintPage() {
  const profile = await requireProfile(['parent']);
  const vehicles = await loadVehicles(profile.id);

  return (
    <PublicShell title="Raise a complaint" back={{ href: '/parent', label: 'Live view' }}>
      <ComplaintForm vehicles={vehicles} onSubmit={submitComplaint} />
    </PublicShell>
  );
}

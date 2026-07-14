import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/session';

export type Role =
  | 'parent' | 'driver' | 'attendant' | 'school_admin' | 'rto_officer' | 'platform_admin';

/** Guard a page by role. Redirects to /login when unauthenticated or forbidden. */
export async function requireProfile(roles?: Role[]) {
  const p = await currentProfile();
  if (!p) redirect('/login');
  if (roles && !roles.includes(p.role as Role)) redirect('/login?forbidden=1');
  return p as { id: string; role: Role; school_id: string | null; full_name: string; email?: string };
}

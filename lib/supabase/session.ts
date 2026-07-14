// User-scoped SSR client — carries the logged-in user's JWT so RLS is the enforcer.
// Used by the privacy-critical reads (parent live view, RTO summary) so the
// database — not the UI — decides what each role may see (BUILD SPEC §7).
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isMockDbEnabled } from './dbConfig';
import { getMockSessionClient } from './mockDb';

export async function sessionClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  if (isMockDbEnabled()) {
    const userId = cookieStore.get('veribus-auth-token')?.value || null;
    return getMockSessionClient(userId);
  }
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            for (const { name, value, options } of toSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // called from a Server Component — safe to ignore (middleware refreshes)
          }
        },
      },
    }
  );
}

export async function currentProfile() {
  const supabase = await sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('id, role, school_id, full_name')
    .eq('id', user.id)
    .maybeSingle();
  return data ? { ...data, email: user.email } : null;
}

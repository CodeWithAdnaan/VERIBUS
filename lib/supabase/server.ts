// Service-role client — bypasses RLS. Used ONLY server-side for the ingest path,
// trip lifecycle writes, watchdog, and operational reads that do their own authz.
// NEVER import this into a client component.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isMockDbEnabled } from './dbConfig';
import { getMockServiceClient } from './mockDb';

let cached: any | null = null;

export function serviceClient(): SupabaseClient {
  if (isMockDbEnabled()) {
    return getMockServiceClient();
  }
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase env missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local'
    );
  }
  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

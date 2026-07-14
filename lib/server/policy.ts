// Loads the active policy_config row from the DB. The app reads NOTHING from
// constants (BUILD SPEC §6).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PolicyRules } from '@/lib/engine/types';

export interface ActivePolicy {
  id: string;
  version: string;
  rules: PolicyRules;
}

export async function getActivePolicy(client: SupabaseClient): Promise<ActivePolicy> {
  const { data, error } = await client
    .from('policy_config')
    .select('id, version, rules')
    .eq('is_active', true)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`policy load failed: ${error.message}`);
  if (!data) throw new Error('No active policy_config. Run npm run db:seed.');
  return { id: data.id, version: data.version, rules: data.rules as PolicyRules };
}

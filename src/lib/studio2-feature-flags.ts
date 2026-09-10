import { supabase } from '@/integrations/supabase/client';

import type { SolarisFeatureFlag } from './feature-flags';

type FeatureFlagClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

export async function isStudio2FeatureEnabled(
  key: SolarisFeatureFlag,
  editionId?: string | null,
  client: FeatureFlagClient = supabase as unknown as FeatureFlagClient,
): Promise<boolean> {
  const { data, error } = await client.rpc('studio2_feature_enabled', {
    p_key: key,
    p_edition_id: editionId ?? null,
  });
  if (error) throw error;
  return data === true;
}

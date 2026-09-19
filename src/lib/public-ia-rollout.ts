import { supabase } from "@/integrations/supabase/client";

type PublicIaRolloutClient = {
  rpc(name: string): PromiseLike<{ data: unknown; error: unknown }>;
};

export async function resolvePublicIaV3Enabled({
  client = supabase as unknown as PublicIaRolloutClient,
}: {
  client?: PublicIaRolloutClient;
} = {}): Promise<boolean> {
  try {
    const { data, error } = await client.rpc("public_ia_v3_enabled");
    if (error) throw error;

    // Legacy chrome is an explicit emergency rollback only. Any missing,
    // malformed or unavailable flag state keeps the new public IA active.
    return data !== false;
  } catch {
    return true;
  }
}

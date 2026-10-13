import { supabase } from "@/integrations/supabase/client";

/**
 * Canonical public/account session exit used by presentation surfaces.
 * Auth-state cache isolation remains owned by AccountCacheIsolation, so callers
 * only request the session mutation and decide their own post-sign-out route.
 */
export async function signOutSolarisAccount() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

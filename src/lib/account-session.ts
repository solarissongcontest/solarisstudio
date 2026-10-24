import { supabase } from "@/integrations/supabase/client";

/**
 * Canonical public/account session exit used by presentation surfaces.
 * Auth-state cache isolation remains owned by AccountCacheIsolation, so callers
 * only request the session mutation and decide their own post-sign-out route.
 *
 * Supabase JavaScript defaults signOut() to the global scope. Solaris account
 * surfaces promise a device-local sign-out, so this helper must explicitly
 * terminate only the current session and leave other devices active.
 */
export async function signOutSolarisAccount() {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw error;
}

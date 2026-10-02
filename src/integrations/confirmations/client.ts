import { supabase as solarisSupabase } from "@/integrations/supabase/client";

/**
 * Compatibility export for the former standalone Confirmations code.
 *
 * Confirmations now lives on Solaris Studio's canonical Supabase project.
 * Keeping this name avoids a noisy UI rewrite while ensuring auth, RPCs and
 * data all use one client, one session and one database.
 */
export const confirmationsSupabase = solarisSupabase as any;

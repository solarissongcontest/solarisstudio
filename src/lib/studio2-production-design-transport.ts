// Infrastructure-only bridge to the canonical Supabase client. V3 domain
// projections receive an injectable RPC interface and never own a connection.
export { supabase as productionDesignSupabaseClient } from "@/integrations/supabase/client";

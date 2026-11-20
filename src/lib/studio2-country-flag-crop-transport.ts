// Infrastructure-only Supabase transport. V3 country-identity domain adapters
// receive a typed, injectable RPC client and never construct a connection.
export { supabase as countryFlagCropSupabaseClient } from "@/integrations/supabase/client";

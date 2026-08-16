import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_TELEVOTING_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_TELEVOTING_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!url || !key) {
  throw new Error("Missing public Televoting Supabase configuration.");
}

export const televotingPublicServer = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

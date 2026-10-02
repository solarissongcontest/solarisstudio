import { createClient } from "@supabase/supabase-js";

function canonicalSupabaseConfig() {
  const url =
    import.meta.env.VITE_SUPABASE_URL ||
    process.env["SUPABASE_URL"];
  const key =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env["SUPABASE_PUBLISHABLE_KEY"];

  if (!url || !key) {
    throw new Error("Solaris Studio database access is unavailable.");
  }

  return { url, key };
}

export function createConfirmationPublicRuntimeClient() {
  const { url, key } = canonicalSupabaseConfig();

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storage: undefined,
    },
  });
}

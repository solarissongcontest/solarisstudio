import { createClient } from "@supabase/supabase-js";

export type ConfirmationRuntimeEnv = {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
};

function canonicalSupabaseConfig(runtime?: ConfirmationRuntimeEnv) {
  const url =
    runtime?.SUPABASE_URL ||
    runtime?.VITE_SUPABASE_URL ||
    import.meta.env.VITE_SUPABASE_URL ||
    process.env["SUPABASE_URL"];
  const key =
    runtime?.SUPABASE_PUBLISHABLE_KEY ||
    runtime?.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env["SUPABASE_PUBLISHABLE_KEY"];

  if (!url || !key) {
    throw new Error("Solaris Studio database access is unavailable.");
  }

  return { url, key };
}

export function createConfirmationPublicRuntimeClient(runtime?: ConfirmationRuntimeEnv) {
  const { url, key } = canonicalSupabaseConfig(runtime);

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storage: undefined,
    },
  });
}

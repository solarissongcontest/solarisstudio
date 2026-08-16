import { createClient } from "@supabase/supabase-js";

function createConfirmationsClient() {
  const url = import.meta.env.VITE_CONFIRMATIONS_SUPABASE_URL;
  const key = import.meta.env.VITE_CONFIRMATIONS_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Confirmations Supabase configuration.");
  }

  return createClient(url, key, {
    auth: {
      storage: typeof window !== "undefined" ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

let client: ReturnType<typeof createConfirmationsClient> | undefined;

export const confirmationsSupabase = new Proxy({} as ReturnType<typeof createConfirmationsClient>, {
  get(_target, prop, receiver) {
    if (!client) client = createConfirmationsClient();
    return Reflect.get(client, prop, receiver);
  },
});

import { createClient } from "@supabase/supabase-js";

function createTelevotingClient() {
  const url = import.meta.env.VITE_TELEVOTING_SUPABASE_URL;
  const key = import.meta.env.VITE_TELEVOTING_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Televoting Supabase configuration.");
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

let client: ReturnType<typeof createTelevotingClient> | undefined;

export const televotingSupabase = new Proxy({} as ReturnType<typeof createTelevotingClient>, {
  get(_target, prop, receiver) {
    if (!client) client = createTelevotingClient();
    return Reflect.get(client, prop, receiver);
  },
});

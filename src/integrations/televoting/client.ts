import { createClient } from "@supabase/supabase-js";

import type { TelevotingDatabase } from "@/integrations/televoting/database.types";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function createTelevotingClient() {
  const url = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Solaris Studio Supabase configuration.");
  }

  return createClient<TelevotingDatabase, "televoting">(url, key, {
    db: { schema: "televoting" },
    global: { fetch: createSupabaseFetch(key) },
    auth: {
      // Televoting is a data/realtime client. Solaris Studio's primary client
      // owns the only browser auth session, so this client must not compete for
      // the same GoTrue storage key or run a second refresh loop.
      storageKey: "solaris-televoting-data-only",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

let client: ReturnType<typeof createTelevotingClient> | undefined;

export const televotingSupabase = new Proxy({} as ReturnType<typeof createTelevotingClient>, {
  get(_target, prop) {
    if (!client) client = createTelevotingClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

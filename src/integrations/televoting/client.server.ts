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

function createTelevotingAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    const missing = [
      ...(!url ? ["SUPABASE_URL"] : []),
      ...(!serviceKey ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
    ];
    throw new Error(`Missing Solaris Studio Supabase environment variable(s): ${missing.join(", ")}.`);
  }

  return createClient<TelevotingDatabase, "televoting">(url, serviceKey, {
    db: { schema: "televoting" },
    global: { fetch: createSupabaseFetch(serviceKey) },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

let client: ReturnType<typeof createTelevotingAdminClient> | undefined;

export const televotingAdmin = new Proxy(
  {} as ReturnType<typeof createTelevotingAdminClient>,
  {
    get(_target, prop) {
      if (!client) client = createTelevotingAdminClient();
      const value = Reflect.get(client, prop, client);
      return typeof value === "function" ? value.bind(client) : value;
    },
  },
);

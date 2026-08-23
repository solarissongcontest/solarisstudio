import { createClient } from "@supabase/supabase-js";

import type { TelevotingDatabase } from "@/integrations/televoting/database.types";
import {
  getSolarisSupabasePublishableKey,
  getSolarisSupabaseUrl,
} from "@/integrations/supabase/public-config";

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
  const url = getSolarisSupabaseUrl();
  const key = getSolarisSupabasePublishableKey();

  if (!url || !key) {
    throw new Error("Missing Solaris Studio Supabase configuration.");
  }

  return createClient<TelevotingDatabase, "televoting">(url, key, {
    db: { schema: "televoting" },
    global: { fetch: createSupabaseFetch(key) },
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
  get(_target, prop) {
    if (!client) client = createTelevotingClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

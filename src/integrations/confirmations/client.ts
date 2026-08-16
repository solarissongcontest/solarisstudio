import { createClient } from "@supabase/supabase-js";

import { supabase as solarisSupabase } from "@/integrations/supabase/client";

async function confirmationsFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(
    typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
  );

  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }

  if (typeof window !== "undefined") {
    const { data } = await solarisSupabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.set("x-solaris-access-token", token);
  }

  return fetch(input, { ...init, headers });
}

function createConfirmationsClient() {
  const url = import.meta.env.VITE_CONFIRMATIONS_SUPABASE_URL;
  const key = import.meta.env.VITE_CONFIRMATIONS_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Confirmations Supabase configuration.");
  }

  return createClient(url, key, {
    global: { fetch: confirmationsFetch },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

let client: ReturnType<typeof createConfirmationsClient> | undefined;

type ConfirmationsClient = ReturnType<typeof createConfirmationsClient>;

export const confirmationsSupabase = new Proxy({} as ConfirmationsClient, {
  get(_target, prop, receiver) {
    // Legacy Confirmations admin pages still call `.auth.getSession()` and
    // `.auth.signOut()`. Those calls now intentionally operate on the one
    // Solaris Studio identity instead of creating a second auth universe.
    if (prop === "auth") return Reflect.get(solarisSupabase, prop, solarisSupabase);

    if (!client) client = createConfirmationsClient();
    return Reflect.get(client, prop, receiver);
  },
});

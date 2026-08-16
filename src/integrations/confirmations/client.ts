import { createClient } from "@supabase/supabase-js";

import { supabase as solarisSupabase } from "@/integrations/supabase/client";

const CONFIRMATIONS_LEGACY_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3dm5ycHVxZWhxY2F0b3d4ZnB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMDcwOTQsImV4cCI6MjEwMTg4MzA5NH0.TsV-Osg8YAqR6jqVLGkDTya97THNAkDtD0S3Ddd6Eu0";

function normalizeOpaqueSupabaseKey(headers: Headers) {
  const authorization = headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return;

  const key = authorization.slice("Bearer ".length);
  if (!key.startsWith("sb_publishable_") && !key.startsWith("sb_secret_")) return;

  headers.delete("Authorization");
  headers.set("apikey", key);
}

async function confirmationsFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(
    typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
  );

  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }

  normalizeOpaqueSupabaseKey(headers);

  if (typeof window !== "undefined") {
    const { data } = await solarisSupabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.set("x-solaris-access-token", token);
  }

  return fetch(input, { ...init, headers });
}

function createConfirmationsClient() {
  const url = import.meta.env.VITE_CONFIRMATIONS_SUPABASE_URL;
  const configuredKey = import.meta.env.VITE_CONFIRMATIONS_SUPABASE_PUBLISHABLE_KEY;
  const key =
    !configuredKey || configuredKey.startsWith("sb_publishable_")
      ? CONFIRMATIONS_LEGACY_ANON_KEY
      : configuredKey;

  if (!url) {
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
    // `.auth.signOut()`. Those calls intentionally use the single Solaris
    // Studio identity rather than creating a second auth universe.
    if (prop === "auth") return Reflect.get(solarisSupabase, prop, solarisSupabase);

    if (!client) client = createConfirmationsClient();
    return Reflect.get(client, prop, receiver);
  },
});

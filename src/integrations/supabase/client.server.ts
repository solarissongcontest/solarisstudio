// Server-side Supabase client.
// Uses the service role when the deployment provides it; otherwise organizer
// requests fall back to the signed-in Solaris session and normal RLS policies.
import { createClient } from '@supabase/supabase-js';
import { getRequestHeader } from '@tanstack/react-start/server';
import type { Database } from './types';

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }

    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function getSupabaseUrl() {
  return (
    process.env['SUPABASE_URL'] ||
    process.env['VITE_SUPABASE_URL'] ||
    import.meta.env.VITE_SUPABASE_URL
  );
}

function createSupabaseServerClient() {
  const url = getSupabaseUrl();
  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];

  if (url && serviceKey) {
    return createClient<Database>(url, serviceKey, {
      global: { fetch: createSupabaseFetch(serviceKey) },
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  const publishableKey =
    process.env['SUPABASE_PUBLISHABLE_KEY'] ||
    process.env['VITE_SUPABASE_PUBLISHABLE_KEY'] ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const authHeader = getRequestHeader('authorization');

  if (!url || !publishableKey || !authHeader?.startsWith('Bearer ')) {
    throw new Error('Solaris Studio database access is unavailable on this deployment.');
  }

  return createClient<Database>(url, publishableKey, {
    global: { headers: { Authorization: authHeader } },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// Do not cache this client. On Cloudflare the fallback path carries the current
// request's organizer bearer token, so sharing it between requests would be
// both incorrect and unsafe.
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseServerClient>, {
  get(_, prop) {
    const client = createSupabaseServerClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

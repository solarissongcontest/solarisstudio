import { createClient } from "@supabase/supabase-js";
import { getRequestHeader } from "@tanstack/react-start/server";

function getBridgeConfig() {
  const url =
    process.env.TELEVOTING_SUPABASE_URL ||
    process.env.VITE_TELEVOTING_SUPABASE_URL ||
    import.meta.env.VITE_TELEVOTING_SUPABASE_URL;

  const publishableKey =
    process.env.TELEVOTING_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_TELEVOTING_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_TELEVOTING_SUPABASE_PUBLISHABLE_KEY;

  const bridgeUrl = process.env.TELEVOTING_ADMIN_BRIDGE_URL;

  if (!url || !publishableKey || !bridgeUrl) {
    throw new Error("Televoting admin bridge is not configured on this deployment yet.");
  }

  return { url, publishableKey, bridgeUrl };
}

function serializeHeaders(source: Headers) {
  const result: Record<string, string> = {};
  source.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "apikey" || lower === "authorization" || lower === "host") return;
    result[key] = value;
  });
  return result;
}

async function requestBody(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.body == null) {
    if (typeof Request !== "undefined" && input instanceof Request) {
      const method = input.method.toUpperCase();
      if (method !== "GET" && method !== "HEAD") return input.clone().text();
    }
    return null;
  }

  if (typeof init.body === "string") return init.body;
  if (init.body instanceof URLSearchParams) return init.body.toString();

  throw new Error("Unsupported Televoting admin request body.");
}

function createBridgeFetch(bridgeUrl: string): typeof fetch {
  return async (input, init) => {
    const authorization = getRequestHeader("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      throw new Error("Solaris organizer authentication is missing.");
    }

    const accessToken = authorization.slice("Bearer ".length).trim();
    if (!accessToken) throw new Error("Solaris organizer authentication is missing.");

    const request = typeof Request !== "undefined" && input instanceof Request ? input : null;
    const headers = new Headers(request?.headers);
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    const method = (init?.method || request?.method || "GET").toUpperCase();
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : request?.url ?? String(input);

    const response = await fetch(bridgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-solaris-access-token": accessToken,
      },
      body: JSON.stringify({
        url,
        method,
        headers: serializeHeaders(headers),
        body: await requestBody(input, init),
      }),
    });

    return response;
  };
}

function createTelevotingAdminClient() {
  const { url, publishableKey, bridgeUrl } = getBridgeConfig();

  // The Lovable-hosted ssc-tele runtime keeps the privileged Supabase key.
  // Solaris Studio uses the public project key only to construct Supabase REST
  // requests, then forwards those requests through the guarded Lovable bridge.
  return createClient(url, publishableKey, {
    global: { fetch: createBridgeFetch(bridgeUrl) },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let client: ReturnType<typeof createTelevotingAdminClient> | undefined;

export const televotingAdmin = new Proxy(
  {} as ReturnType<typeof createTelevotingAdminClient>,
  {
    get(_target, prop, receiver) {
      if (!client) client = createTelevotingAdminClient();
      return Reflect.get(client, prop, receiver);
    },
  },
);

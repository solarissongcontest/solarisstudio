import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const CONFIRMATIONS_HOST = "xwvnrpuqehqcatowxfpx.supabase.co";
const CONFIRMATIONS_LEGACY_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3dm5ycHVxZWhxY2F0b3d4ZnB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMDcwOTQsImV4cCI6MjEwMTg4MzA5NH0.TsV-Osg8YAqR6jqVLGkDTya97THNAkDtD0S3Ddd6Eu0";

function isOpaqueSupabaseKey(value: string | null) {
  return Boolean(value?.startsWith("sb_publishable_") || value?.startsWith("sb_secret_"));
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return "";
}

// Modern opaque Supabase keys work as `apikey` values but are not bearer JWTs.
// The Confirmations project currently rejects the merged Cloudflare runtime's
// fallback bearer handling with 401. Its legacy anon JWT remains active and is
// intentionally public, so force that compatible public credential only for
// requests to the Confirmations project. Real user bearer tokens for Solaris
// Studio and every other backend remain untouched.
const runtime = globalThis as typeof globalThis & {
  __solarisSupabaseOpaqueKeyFetchPatched?: boolean;
};

if (!runtime.__solarisSupabaseOpaqueKeyFetchPatched && typeof runtime.fetch === "function") {
  const baseFetch = runtime.fetch.bind(globalThis);

  runtime.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    const url = requestUrl(input);
    const authorization = headers.get("Authorization");
    const bearer = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : null;
    const apiKey = headers.get("apikey");

    if (
      url.includes(CONFIRMATIONS_HOST) &&
      (isOpaqueSupabaseKey(bearer) || isOpaqueSupabaseKey(apiKey))
    ) {
      headers.set("apikey", CONFIRMATIONS_LEGACY_ANON_KEY);
      headers.set("Authorization", `Bearer ${CONFIRMATIONS_LEGACY_ANON_KEY}`);
    } else if (isOpaqueSupabaseKey(bearer)) {
      headers.delete("Authorization");
      if (bearer) headers.set("apikey", bearer);
    }

    return baseFetch(input, { ...init, headers });
  }) as typeof fetch;

  runtime.__solarisSupabaseOpaqueKeyFetchPatched = true;
}

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));

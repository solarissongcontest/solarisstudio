import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// Supabase's modern sb_publishable_/sb_secret_ project keys are opaque API
// keys, not bearer JWTs. Some Supabase clients use the project key as a
// fallback Authorization value when no user session exists. The Supabase
// gateway rejects that with 401, so normalize those requests once at the
// server boundary while leaving real user bearer tokens untouched.
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

    const authorization = headers.get("Authorization");
    if (authorization?.startsWith("Bearer ")) {
      const key = authorization.slice("Bearer ".length);
      if (key.startsWith("sb_publishable_") || key.startsWith("sb_secret_")) {
        headers.delete("Authorization");
        headers.set("apikey", key);
      }
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

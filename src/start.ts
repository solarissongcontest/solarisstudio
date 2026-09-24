import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { renderErrorPage } from "./lib/error-page";
import { GLOBAL_MAINTENANCE_MODE } from "./lib/maintenance";
import { renderMaintenancePage } from "./lib/maintenance-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const MAINTENANCE_ASSET_PATHS = new Set([
  "/tsbc-maintenance-mark.svg",
  "/solaris-studio-mark.png",
  "/favicon.ico",
]);

const maintenanceMiddleware = createMiddleware().server(async ({ next }) => {
  if (!GLOBAL_MAINTENANCE_MODE) return next();

  const request = getRequest();
  if (!request) return next();

  const url = new URL(request.url);
  if (MAINTENANCE_ASSET_PATHS.has(url.pathname)) return next();

  const headers = {
    "cache-control": "no-store, max-age=0",
    "content-language": "en",
  };

  if (request.method === "GET" || request.method === "HEAD") {
    return new Response(request.method === "HEAD" ? null : renderMaintenancePage(), {
      status: 503,
      headers: {
        ...headers,
        "content-type": "text/html; charset=utf-8",
      },
    });
  }

  return new Response(
    JSON.stringify({
      error: "solaris_studio_maintenance",
      message:
        "Solaris Studio is temporarily offline while database service is restored. Writes are disabled during the outage.",
      expected_return: "2026-10-10",
    }),
    {
      status: 503,
      headers: {
        ...headers,
        "content-type": "application/json; charset=utf-8",
      },
    },
  );
});

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
  requestMiddleware: [maintenanceMiddleware, errorMiddleware, csrfMiddleware],
}));

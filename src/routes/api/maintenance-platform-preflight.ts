import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { GLOBAL_MAINTENANCE_MODE } from "@/lib/maintenance";
import { runProtectedPlatformExitPreflight } from "@/lib/platform-exit-preflight.functions";

function responseJson(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

export const Route = createFileRoute("/api/maintenance-platform-preflight")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!GLOBAL_MAINTENANCE_MODE) return responseJson({ error: "not_found" }, 404);
        const origin = request.headers.get("origin");
        if (origin && origin !== new URL(request.url).origin) {
          return responseJson({ error: "request_origin_rejected" }, 403);
        }
        if (!/^Bearer\s+[^\s]+$/.test(request.headers.get("authorization") ?? "")) {
          return responseJson({ error: "organizer_auth_required" }, 401);
        }
        if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
          return responseJson({ error: "json_required" }, 415);
        }
        const raw = await request.text();
        if (raw.length > 512) return responseJson({ error: "request_too_large" }, 413);
        let input: unknown;
        try {
          input = JSON.parse(raw);
        } catch {
          return responseJson({ error: "invalid_json" }, 400);
        }
        // Maintenance at present is in read_only. This endpoint cannot be
        // repurposed for publication, a direct platform write, or arbitrary RPC.
        if (
          !input ||
          typeof input !== "object" ||
          Array.isArray(input) ||
          Object.keys(input).length !== 1 ||
          (input as { targetMode?: unknown }).targetMode !== "degraded"
        ) {
          return responseJson({ error: "only_read_only_to_degraded_preflight" }, 400);
        }

        try {
          // Auth verifies the user's token; Permission Engine checks the
          // maintenance.manage capability before the service-role preflight
          // receipt is created. All external health checks remain server-side.
          const receipt = await runProtectedPlatformExitPreflight("degraded");
          return responseJson({ receipt });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Recovery preflight unavailable.";
          const forbidden = /not authenticated|organizer access|required|capability|permission/i.test(message);
          return responseJson(
            { error: "recovery_preflight_failed", message: message.slice(0, 320) },
            forbidden ? 403 : 503,
          );
        }
      },
    },
  },
});

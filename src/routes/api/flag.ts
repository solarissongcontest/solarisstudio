import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const LOVABLE_ORIGIN = "https://solarisstudio.lovable.app";
const ALLOWED_PREFIX = "/__l5e/assets-v1/";

export const Route = createFileRoute("/api/flag")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const path = url.searchParams.get("path") ?? "";

        if (!path.startsWith(ALLOWED_PREFIX)) {
          return new Response("Invalid flag path", { status: 400 });
        }

        const upstream = await fetch(`${LOVABLE_ORIGIN}${path}`, {
          headers: {
            Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          },
        });

        if (!upstream.ok || !upstream.body) {
          return new Response("Flag not found", { status: upstream.status || 502 });
        }

        const headers = new Headers();
        headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "image/jpeg");
        headers.set("Cache-Control", "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000");
        headers.set("X-Content-Type-Options", "nosniff");

        return new Response(upstream.body, {
          status: 200,
          headers,
        });
      },
    },
  },
});

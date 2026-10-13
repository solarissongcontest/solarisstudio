import { createServerFn } from "@tanstack/react-start";

/**
 * Canonical V3 Edition server boundary. The browser supplies only the route
 * slug; publication state, counts and section availability are resolved on the
 * server from public-safe sources.
 */
export const getV3EditionBundle = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => {
    const slug =
      typeof input === "object" && input && "slug" in input
        ? String((input as { slug?: unknown }).slug ?? "")
        : "";
    return { slug };
  })
  .handler(async ({ data }) => {
    const { loadV3EditionBundle } = await import(
      "@/integrations/v3/edition-source.server"
    );
    return loadV3EditionBundle(data.slug);
  });

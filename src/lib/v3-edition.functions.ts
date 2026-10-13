import { createServerFn } from "@tanstack/react-start";

/**
 * Canonical V3 Edition server boundary. The browser supplies only the route
 * slug; publication state, counts and section availability are resolved on the
 * server from public-safe sources.
 */
export const getV3EditionBundle = createServerFn({ method: "GET" })
  .validator((input: { slug: string }) => ({ slug: String(input.slug ?? "") }))
  .handler(async ({ data }) => {
    const { loadV3EditionBundle } = await import(
      "@/integrations/v3/edition-source.server"
    );
    return loadV3EditionBundle(data.slug);
  });

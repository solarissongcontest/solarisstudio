import { createServerFn } from "@tanstack/react-start";

/**
 * Canonical V3 Explore server boundary. The browser supplies no identity,
 * publication state, counts or current-edition guess.
 */
export const getV3ExploreBundle = createServerFn({ method: "GET" }).handler(
  async () => {
    const { loadCurrentV3ExploreBundle } = await import(
      "@/integrations/v3/explore-source.server"
    );
    return loadCurrentV3ExploreBundle();
  },
);

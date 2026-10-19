import { createServerFn } from "@tanstack/react-start";

/**
 * Canonical Public V3 Live server boundary. The browser supplies no show state,
 * voting status, publication state or performer cursor.
 */
export const getV3LiveBundle = createServerFn({ method: "GET" }).handler(
  async () => {
    const { loadV3LiveBundle } = await import(
      "@/integrations/v3/live-source.server"
    );
    return loadV3LiveBundle();
  },
);

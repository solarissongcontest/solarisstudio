import { createServerFn } from "@tanstack/react-start";

/**
 * Canonical V3 Results root server boundary. Publication state, identities and
 * result rows are resolved server-side; the browser supplies no archive query.
 */
export const getV3ResultsBundle = createServerFn({ method: "GET" }).handler(
  async () => {
    const { loadLatestV3ResultsBundle } = await import(
      "@/integrations/v3/results-source.server"
    );
    return loadLatestV3ResultsBundle();
  },
);

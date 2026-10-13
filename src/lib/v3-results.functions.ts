import { createServerFn } from "@tanstack/react-start";

/**
 * Browser entry point for the bounded V3 Results bundle. Publication,
 * authenticated spoiler preference and delegation ownership remain server-side.
 */
export const getV3ResultsBundle = createServerFn({ method: "GET" }).handler(
  async () => {
    const { loadV3ResultsBundle } = await import(
      "@/integrations/v3/results-source.server"
    );
    return loadV3ResultsBundle();
  },
);

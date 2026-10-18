import { createServerFn } from "@tanstack/react-start";

/**
 * Public V3 Scorecharts server boundary. The browser supplies no edition,
 * publication or show visibility claims.
 */
export const getV3ScorechartsBundle = createServerFn({ method: "GET" }).handler(
  async () => {
    const { loadV3ScorechartsBundle } = await import(
      "@/integrations/v3/scorecharts-source.server"
    );
    return loadV3ScorechartsBundle();
  },
);

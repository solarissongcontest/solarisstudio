import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  showId: z.string().uuid(),
});

/**
 * Canonical installed-app Scoreboard read boundary. A browser Show id is only an
 * identifier; publication and Result-version authority are revalidated by the
 * server source before any official score is returned.
 */
export const getV3ScoreboardBundle = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const { loadV3ScoreboardBundle } = await import(
      "@/integrations/v3/scoreboard-source.server"
    );
    return loadV3ScoreboardBundle(data.showId);
  });

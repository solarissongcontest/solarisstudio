import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getV3PublicScoreboard = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ showId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { loadV3PublicScoreboard } = await import("@/integrations/v3/scoreboard-source.server");
    return loadV3PublicScoreboard(data.showId);
  });

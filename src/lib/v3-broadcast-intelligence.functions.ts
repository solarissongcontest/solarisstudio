import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  showId: z.string().trim().min(1).max(120).nullable().optional(),
});

export const getV3BroadcastIntelligenceBundle = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const { loadV3BroadcastIntelligenceBundle } = await import(
      "@/integrations/v3/broadcast-intelligence-source.server"
    );
    return loadV3BroadcastIntelligenceBundle(data.showId ?? null);
  });

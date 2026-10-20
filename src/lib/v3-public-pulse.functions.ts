import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z
  .object({
    limit: z.number().int().min(1).max(50),
  })
  .strict();

/** Public Pulse accepts a bounded page size, never browser-selected identity or publication scope. */
export const getV3PublicPulseEvents = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const { loadV3PublicPulseEvents } = await import(
      "@/integrations/v3/public-pulse.server"
    );
    return loadV3PublicPulseEvents(data.limit);
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  showId: z.string().trim().min(1).max(120).nullable().optional(),
});

/** Official public inputs only. Scenario state never crosses this boundary. */
export const getV3ResultLabBundle = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const { loadV3ResultLabBundle } = await import(
      "@/integrations/v3/result-lab-source.server"
    );
    return loadV3ResultLabBundle(data.showId ?? null);
  });

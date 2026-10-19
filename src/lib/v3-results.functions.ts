import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  showId: z.string().uuid().nullable().optional(),
});

/**
 * Canonical V3 Results root server boundary. Publication state, identities and
 * result rows are resolved server-side. A browser show id is only a nomination;
 * the source revalidates it against the canonically published result archive.
 */
export const getV3ResultsBundle = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => inputSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { loadV3ResultsBundle } = await import(
      "@/integrations/v3/results-source.server"
    );
    return loadV3ResultsBundle(data.showId ?? null);
  });

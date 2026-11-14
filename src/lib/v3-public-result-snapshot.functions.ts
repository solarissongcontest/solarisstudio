import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z
  .object({
    showId: z.string().uuid(),
  })
  .strict();

/**
 * Public server-function boundary for the System-owned immutable Result
 * projection. Browser input is object identity only; publication and version
 * authority remain entirely server-side.
 */
export const getV3PublishedResultSnapshot = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const { loadV3PublishedResultSnapshot } = await import(
      "@/integrations/v3/public-result-snapshot.server"
    );
    return loadV3PublishedResultSnapshot(data.showId);
  });

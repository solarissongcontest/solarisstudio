import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  showId: z.string().uuid(),
  countryId: z.string().uuid(),
});

/**
 * Read-only public-country Jury Share boundary.
 * The browser supplies only object identity. Canonical ballot/result/version
 * data is loaded and authorized by the server-side System projection.
 */
export const getV3PublicJuryShareProjection = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const { loadV3PublicJuryShareProjection } = await import(
      "@/integrations/v3/jury-share-source.server"
    );
    return loadV3PublicJuryShareProjection(data);
  });

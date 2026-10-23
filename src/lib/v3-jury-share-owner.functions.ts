import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  showId: z.string().uuid(),
  countryId: z.string().uuid(),
});

/**
 * Read-only authenticated Jury Share boundary for Me/History.
 * The server-authenticated request is authoritative for viewer identity; the
 * browser may nominate only the Show and Country object identities.
 */
export const getV3OwnerJuryShareProjection = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const { loadV3OwnerJuryShareProjection } = await import(
      "@/integrations/v3/jury-share-owner-source.server"
    );
    return loadV3OwnerJuryShareProjection(data);
  });

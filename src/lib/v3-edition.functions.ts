import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  slug: z.string().trim().min(1).max(120),
});

/**
 * Canonical V3 Edition server boundary. The browser supplies only the public
 * edition slug; publication state, identities and result visibility stay owned
 * by the server source.
 */
export const getV3EditionBundle = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const { loadV3EditionBundle } = await import(
      "@/integrations/v3/edition-source.server"
    );
    return loadV3EditionBundle({ slug: data.slug });
  });

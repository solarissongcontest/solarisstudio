import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  code: z.string().trim().min(1).max(24),
});

/**
 * Browser supplies only the public country/delegation code. Publication state,
 * entry visibility and profile contents remain server-owned.
 */
export const getV3DelegationBundle = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const { loadV3DelegationBundle } = await import(
      "@/integrations/v3/delegation-source.server"
    );
    return loadV3DelegationBundle({ code: data.code });
  });

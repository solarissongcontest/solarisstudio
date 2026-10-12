import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z
  .object({
    editionId: z.string().trim().min(1).max(100).nullable().optional(),
  })
  .optional();

/**
 * Canonical V3 Home + Participate bootstrap boundary.
 *
 * Viewer identity is intentionally not accepted from the browser. The server
 * source derives it from the request's authenticated Solaris bearer token and
 * executes participant-scoped reads through that user's RLS context.
 */
export const getV3PrimarySurfaceBundle = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const { loadCurrentV3PrimarySurfaceBundle } = await import(
      "@/integrations/v3/primary-surface-source.server"
    );
    return loadCurrentV3PrimarySurfaceBundle({
      editionId: data?.editionId ?? null,
    });
  });

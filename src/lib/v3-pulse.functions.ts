import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const pulseCategorySchema = z.enum([
  "entries",
  "running_orders",
  "predictions",
  "results",
  "records",
]);

const pulseCursorSchema = z.object({
  publishedAt: z.string().min(1).max(64),
  id: z.string().uuid(),
}).strict();

const pulseRequestSchema = z.object({
  cursor: pulseCursorSchema.nullable().optional(),
  category: pulseCategorySchema.nullable().optional(),
}).strict();

/**
 * The browser may choose only a bounded category and the opaque stable cursor
 * issued by the previous page. It cannot select viewer identity or widen the
 * server-owned publication boundary.
 */
export const getV3PublicPulse = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => pulseRequestSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { loadV3PublicPulse } = await import("@/integrations/v3/public-pulse.server");
    return loadV3PublicPulse(data.cursor ?? null, data.category ?? null);
  });

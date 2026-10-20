import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const categorySchema = z.enum([
  "entries",
  "running_orders",
  "predictions",
  "results",
  "records",
]);

const cursorSchema = z.object({
  publishedAt: z.string().min(1).max(64),
  id: z.string().uuid(),
}).strict();

const inputSchema = z.object({
  limit: z.number().int().min(1).max(50),
  cursor: cursorSchema.nullable().optional(),
  category: categorySchema.nullable().optional(),
}).strict();

/**
 * Public Pulse accepts only bounded presentation scope and the opaque stable
 * cursor issued by the previous canonical page. Viewer identity, role and
 * publication authority never cross this browser-selected boundary.
 */
export const getV3PublicPulseEvents = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const { loadV3PublicPulseEvents } = await import(
      "@/integrations/v3/public-pulse.server"
    );
    return loadV3PublicPulseEvents(
      data.limit,
      data.cursor ?? null,
      data.category ?? null,
    );
  });

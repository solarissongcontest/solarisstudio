import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z
  .object({
    cursor: z
      .object({
        before: z.string().datetime({ offset: true }),
        operationId: z.string().uuid(),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();

/**
 * Authenticated, identity-free browser boundary. The caller cannot select a
 * user, country, delegation, edition, receipt, or source-event scope. The only
 * accepted input is an opaque continuation cursor previously issued by System.
 */
export const getV3ParticipantActivity = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => inputSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { loadV3ParticipantActivity } = await import(
      "@/integrations/v3/participant-activity.server"
    );
    return loadV3ParticipantActivity(data.cursor ?? null);
  });

import { createServerFn } from "@tanstack/react-start";

import { validateV3ParticipantActivityCursor } from "./v3-participant-activity";

/**
 * Authenticated, identity-free browser boundary. The caller cannot select a
 * user, country, delegation, edition, receipt, or source-event scope.
 */
export const getV3ParticipantActivity = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => validateV3ParticipantActivityCursor(input))
  .handler(async ({ data }) => {
    const { loadV3ParticipantActivity } = await import(
      "@/integrations/v3/participant-activity.server"
    );
    return loadV3ParticipantActivity(data);
  });

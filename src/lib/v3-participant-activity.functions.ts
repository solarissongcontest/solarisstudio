import { createServerFn } from "@tanstack/react-start";

/**
 * Authenticated, identity-free browser boundary. The caller cannot select a
 * user, country, delegation, edition, receipt, or source-event scope.
 */
export const getV3ParticipantActivity = createServerFn({ method: "GET" }).handler(
  async () => {
    const { loadV3ParticipantActivity } = await import(
      "@/integrations/v3/participant-activity.server"
    );
    return loadV3ParticipantActivity();
  },
);

import { createServerFn } from "@tanstack/react-start";

/** Authenticated boundary with no browser-selected viewer or delegation scope. */
export const getV3ParticipationHistory = createServerFn({ method: "GET" }).handler(
  async () => {
    const { loadV3ParticipationHistory } = await import(
      "@/integrations/v3/participation-history.server"
    );
    return loadV3ParticipationHistory();
  },
);

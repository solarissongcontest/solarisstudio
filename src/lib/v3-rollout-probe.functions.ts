import { createServerFn } from "@tanstack/react-start";

/**
 * Browser-visible rollout result only. The server keeps the persisted flag row,
 * cohort lists and authorization details private and returns one evaluated
 * boolean plus the canonical edition/user scope used for the decision.
 */
export const getV3RolloutProbe = createServerFn({ method: "GET" }).handler(
  async () => {
    const { loadV3RolloutProbe } = await import(
      "@/integrations/v3/rollout-probe.server"
    );
    return loadV3RolloutProbe();
  },
);

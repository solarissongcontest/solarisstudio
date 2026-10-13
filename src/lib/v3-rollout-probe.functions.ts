import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const editionSlugSchema = z.object({
  slug: z.string().trim().min(1).max(120),
});

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

/**
 * Edition-route variant. The browser provides only the public slug; the server
 * resolves the canonical edition id before evaluating edition-scoped flags.
 */
export const getV3EditionRolloutProbe = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => editionSlugSchema.parse(input))
  .handler(async ({ data }) => {
    const { loadV3EditionRolloutProbe } = await import(
      "@/integrations/v3/rollout-probe.server"
    );
    return loadV3EditionRolloutProbe(data.slug);
  });

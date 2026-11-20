import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const filters = z.object({
  page: z.number().int().min(0).max(200),
  organization: z.string().max(100),
  country: z.string().max(16),
  scope: z.enum(["all", "current", "ended"]),
});

export const getWorldMembershipChronicle = createServerFn({ method: "GET" })
  .inputValidator((value: unknown) => filters.parse(value))
  .handler(async ({ data }) => {
    const { loadWorldMembershipChronicle } = await import(
      "@/integrations/v3/terra-world-membership-chronicle.server"
    );
    return loadWorldMembershipChronicle(data);
  });

export const getWorldMembershipInstitutions = createServerFn({ method: "GET" })
  .handler(async () => {
    const { loadWorldMembershipInstitutions } = await import(
      "@/integrations/v3/terra-world-membership-chronicle.server"
    );
    return loadWorldMembershipInstitutions();
  });

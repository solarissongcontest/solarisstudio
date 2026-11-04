import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { WORLD_DIRECTORY_STATUSES } from "./terra-world-public";

const directoryInput = z.object({
  page: z.number().int().min(0).max(200),
  search: z.string().max(120),
  status: z.enum(WORLD_DIRECTORY_STATUSES),
});
const organizationInput = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
});

export const getTerraWorldDirectory = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => directoryInput.parse(input))
  .handler(async ({ data }) => {
    const { loadTerraWorldDirectory } = await import("@/integrations/v3/terra-world-public.server");
    return loadTerraWorldDirectory(data);
  });

export const getTerraWorldOrganization = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => organizationInput.parse(input))
  .handler(async ({ data }) => {
    const { loadTerraWorldOrganization } = await import("@/integrations/v3/terra-world-public.server");
    return loadTerraWorldOrganization(data.slug);
  });

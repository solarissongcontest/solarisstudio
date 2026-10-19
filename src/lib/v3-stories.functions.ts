import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const detailSchema = z.object({
  editionSlug: z.string().trim().min(1).max(120),
});

export const getV3StoriesIndexBundle = createServerFn({ method: "GET" }).handler(
  async () => {
    const { loadV3StoriesIndexBundle } = await import(
      "@/integrations/v3/stories-source.server"
    );
    return loadV3StoriesIndexBundle();
  },
);

export const getV3StoryDetailBundle = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => detailSchema.parse(input))
  .handler(async ({ data }) => {
    const { loadV3StoryDetailBundle } = await import(
      "@/integrations/v3/stories-source.server"
    );
    return loadV3StoryDetailBundle(data.editionSlug);
  });

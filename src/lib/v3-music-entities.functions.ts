import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const entityInput = z.object({
  id: z.string().uuid(),
});

const listInput = z.object({
  query: z.string().trim().max(120).optional().nullable(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const getV3ArtistProjection = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => entityInput.parse(input))
  .handler(async ({ data }) => {
    const { loadV3ArtistProjection } = await import(
      "@/integrations/v3/music-entities-source.server"
    );
    return loadV3ArtistProjection(data.id);
  });

export const getV3SongProjection = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => entityInput.parse(input))
  .handler(async ({ data }) => {
    const { loadV3SongProjection } = await import(
      "@/integrations/v3/music-entities-source.server"
    );
    return loadV3SongProjection(data.id);
  });

export const getV3ArtistIndexProjection = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => listInput.parse(input))
  .handler(async ({ data }) => {
    const { loadV3ArtistIndexProjection } = await import(
      "@/integrations/v3/music-entities-source.server"
    );
    return loadV3ArtistIndexProjection(data);
  });

export const getV3SongIndexProjection = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => listInput.parse(input))
  .handler(async ({ data }) => {
    const { loadV3SongIndexProjection } = await import(
      "@/integrations/v3/music-entities-source.server"
    );
    return loadV3SongIndexProjection(data);
  });

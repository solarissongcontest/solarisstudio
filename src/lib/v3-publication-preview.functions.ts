import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const publicationConfigSchema = z.object({
  participants: z.boolean(),
  artists: z.boolean(),
  songs: z.boolean(),
  semi_split: z.boolean(),
  running_order: z.boolean(),
  qualifiers: z.boolean(),
  results: z.boolean(),
  jury_results: z.boolean(),
  televote_results: z.boolean(),
  detailed_voting: z.boolean(),
});

const previewInputSchema = z.object({
  editionId: z.string().uuid(),
  showId: z.string().uuid(),
  expectedPublicationVersion: z.number().int().positive(),
  config: publicationConfigSchema,
});

/**
 * Non-mutating Organizer Publication preview.
 *
 * POST is intentional: candidate configs can contain unpublished intent and
 * must not be encoded into URLs, browser history or an indexable GET surface.
 * Authorization and exact source-version checks live in the server-only source.
 */
export const getV3AuthoritativePublicationPreview = createServerFn({
  method: "POST",
})
  .inputValidator((input: unknown) => previewInputSchema.parse(input))
  .handler(async ({ data }) => {
    const { loadV3AuthoritativePublicationPreview } = await import(
      "@/integrations/v3/publication-preview.server"
    );
    return loadV3AuthoritativePublicationPreview(data);
  });

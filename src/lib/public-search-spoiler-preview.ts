import { resolveCurrentPublicEdition } from "./current-contest-state";
import type { Edition, Show } from "./data";
import { showPublishesResults } from "./publication";

export type PublicSearchSpoilerPreviewScope = {
  editionId: string | null;
  editionSlug: string | null;
};

/**
 * Search is a preview surface, not an implicit decision to reveal results.
 * An opted-in viewer should not see current-edition record/story spoilers in
 * suggestions just because the official final has been published.
 *
 * Keep public navigation intact. Results and Stories own the deliberate
 * reveal experience; this helper does not change publication authority.
 */
export function resolvePublicSearchSpoilerPreviewScope(input: {
  spoilerFree: boolean;
  editions: readonly Edition[];
  shows: readonly Show[];
}): PublicSearchSpoilerPreviewScope {
  if (!input.spoilerFree) return { editionId: null, editionSlug: null };

  const current = resolveCurrentPublicEdition(input.editions);
  if (!current) return { editionId: null, editionSlug: null };

  const publishedFinal = input.shows.some(
    (show) =>
      show.edition_id === current.id &&
      (show.kind === "grand-final" || show.kind === "final") &&
      showPublishesResults(show),
  );

  return publishedFinal
    ? { editionId: current.id, editionSlug: current.slug }
    : { editionId: null, editionSlug: null };
}

export function excludeSearchSpoilerEdition<T extends { edition_id: string }>(
  rows: T[],
  protectedEditionId: string | null,
): T[] {
  return protectedEditionId
    ? rows.filter((row) => row.edition_id !== protectedEditionId)
    : rows;
}

export function excludeSearchSpoilerStories<T extends { editionSlug: string }>(
  stories: T[],
  protectedEditionSlug: string | null,
): T[] {
  return protectedEditionSlug
    ? stories.filter((story) => story.editionSlug !== protectedEditionSlug)
    : stories;
}

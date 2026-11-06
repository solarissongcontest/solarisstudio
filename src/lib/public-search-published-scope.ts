import {
  isShowPublic,
  resolveShowPublication,
  showPublishesResults,
  type PublicationAwareShow,
} from "./publication";

type SearchEdition = { id: string; published: boolean | null };
type SearchShow = PublicationAwareShow & { id: string; edition_id: string };

/**
 * Public discovery never borrows the signed-in viewer's broader read scope.
 * Canonical edition/show publication remains the authority for the result.
 */
export function publicSearchPublicationScope<
  E extends SearchEdition,
  S extends SearchShow,
>(editions: readonly E[], shows: readonly S[]) {
  const publicEditions = editions.filter((edition) => edition.published === true);
  const publicEditionIds = new Set(publicEditions.map((edition) => edition.id));
  const publicShows = shows.filter(
    (show) => publicEditionIds.has(show.edition_id) && isShowPublic(show),
  );
  const publishedResultShowIds = new Set(
    publicShows.filter(showPublishesResults).map((show) => show.id),
  );
  const detailedVotingShowIds = new Set(
    publicShows
      .filter((show) => resolveShowPublication(show).detailed_voting)
      .map((show) => show.id),
  );

  return {
    publicEditions,
    publicEditionIds,
    publicShows,
    publishedResultShowIds,
    detailedVotingShowIds,
  };
}

export function publicSearchRowsForPublishedShows<T extends { show_id: string | null }>(
  rows: readonly T[],
  allowedShowIds: ReadonlySet<string>,
): T[] {
  return rows.filter(
    (row) => row.show_id != null && allowedShowIds.has(row.show_id),
  );
}

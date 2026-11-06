import type { Edition, Show } from "./data";
import { hasPublishedResults, isShowPublic, resolveShowPublication } from "./publication";

/**
 * Direct Show deep links must obey both publication layers. A published Show
 * cannot expose a draft/unpublished Edition or a mismatched historical context.
 * The server's RLS/publication rules remain authoritative for data access.
 */
export function isPublishedShowInPublishedEdition(
  show: Pick<Show, "edition_id" | "published" | "publication_config"> | null | undefined,
  edition: Pick<Edition, "id" | "published"> | null | undefined,
): boolean {
  return Boolean(
    show &&
    edition &&
    edition.published &&
    show.edition_id === edition.id &&
    isShowPublic(show),
  );
}

/**
 * Query IDs for public Show detail. Undefined disables the matching existing
 * React Query hooks before requests reach Supabase. This is a client-side
 * resource/defense-in-depth gate, NOT a substitute for server publication/RLS.
 *
 * Individual ballots and voter identities require detailed voting publication,
 * even when aggregate jury or televote totals are already public.
 */
export function publishedShowReadAccess(
  show: Pick<Show, "id" | "edition_id" | "published" | "publication_config"> | null | undefined,
  edition: Pick<Edition, "id" | "published"> | null | undefined,
) {
  if (!show || !isPublishedShowInPublishedEdition(show, edition)) {
    return {
      showId: undefined,
      editionId: undefined,
      resultsId: undefined,
      juryVotesId: undefined,
      televoteVotesId: undefined,
      votersId: undefined,
      televoteDetailId: undefined,
    };
  }

  const published = resolveShowPublication(show);
  const detailed = published.detailed_voting;
  return {
    showId: show.id,
    editionId: show.edition_id,
    resultsId: hasPublishedResults(published) ? show.id : undefined,
    juryVotesId: detailed && published.jury_results ? show.id : undefined,
    televoteVotesId: detailed && published.televote_results ? show.id : undefined,
    votersId: detailed && (published.jury_results || published.televote_results) ? show.id : undefined,
    televoteDetailId: detailed && published.televote_results ? show.id : undefined,
  };
}

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
  // With no published owning context, the canonical resolver returns all-false
  // publication flags. One projection governs every optional public read.
  const permittedShow = show && isPublishedShowInPublishedEdition(show, edition) ? show : undefined;
  const publication = resolveShowPublication(permittedShow);
  const showId = permittedShow?.id;
  const detailed = publication.detailed_voting;
  return {
    showId,
    editionId: permittedShow?.edition_id,
    resultsId: hasPublishedResults(publication) ? showId : undefined,
    juryVotesId: detailed && publication.jury_results ? showId : undefined,
    televoteVotesId: detailed && publication.televote_results ? showId : undefined,
    votersId: detailed && (publication.jury_results || publication.televote_results) ? showId : undefined,
    televoteDetailId: detailed && publication.televote_results ? showId : undefined,
  };
}

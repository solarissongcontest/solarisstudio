import type { Edition, Show } from "./data";
import { isShowPublic } from "./publication";

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

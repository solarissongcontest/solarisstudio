import { normalizeLegacyEditionStatus } from "./edition-state";
import type { Edition } from "./data";

/** Presentation-only, bounded published historical previews for ordinary web.
 * This consumes the existing Editions query; it owns no archive data reader.
 * Approval of links is supplied by the canonical release gate.
 */
export function selectExploreWebArchiveHighlights<T extends Pick<Edition, "id" | "slug" | "status" | "edition_number" | "published">>(
  editions: readonly T[],
  featuredId: string | null,
  allowsReleased: (href: string) => boolean,
): T[] {
  return editions
    .filter((edition) => {
      if (!edition.published || !edition.slug || edition.id === featuredId) return false;
      const lifecycle = normalizeLegacyEditionStatus(edition.status);
      return (lifecycle === "archived" || lifecycle === "post_edition") &&
        allowsReleased(`/editions/${edition.slug}`);
    })
    .sort((left, right) =>
      (right.edition_number ?? -1) - (left.edition_number ?? -1) ||
      left.id.localeCompare(right.id),
    )
    .slice(0, 4);
}

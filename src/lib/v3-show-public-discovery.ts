import type { Edition, Show } from "./data";
import { isShowPublic } from "./publication";

/**
 * Public Explore must not advertise a show from an unpublished edition,
 * even when the show row itself remains marked published. This is a
 * presentation boundary; the destination still enforces its own authority.
 */
export function publicShowsForDiscovery<
  T extends Pick<Show, "id" | "edition_id" | "published" | "publication_config">,
>(shows: readonly T[], editions: readonly Pick<Edition, "id" | "published">[]): T[] {
  const publishedEditionIds = new Set(
    editions.filter((edition) => edition.published === true).map((edition) => edition.id),
  );
  return shows.filter(
    (show) => publishedEditionIds.has(show.edition_id) && isShowPublic(show),
  );
}

/**
 * Recent links are stored locally and can outlive a publication change.
 * Hide stale show-detail links until a fresh public-show read confirms them.
 * Non-show recents remain owned by their respective discovery surfaces.
 */
export function visibleRecentShowDestinations<T extends { path: string }>(
  recents: readonly T[],
  publicShows: readonly Pick<Show, "id">[],
): T[] {
  const visibleShowIds = new Set(publicShows.map((show) => show.id));
  return recents.filter((recent) => {
    if (!recent.path.startsWith("/shows/")) return true;
    const match = /^\/shows\/([^/?#]+)\/?(?:[?#].*)?$/i.exec(recent.path);
    if (!match) return false;
    try {
      return visibleShowIds.has(decodeURIComponent(match[1]));
    } catch {
      return false;
    }
  });
}

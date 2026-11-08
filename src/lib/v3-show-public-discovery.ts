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
 * Show recents live in shared-device storage and may outlive a rename or
 * publication reversal. Require a freshly verified public Show identity, then
 * display the canonical published Show name instead of a cached page title.
 * A stored title may contain a winner or another spoiler, even when its URL
 * still points to a public Show. Missing Show names use a neutral fallback.
 * Other public recent types keep their independent publication policies.
 */
export function visibleRecentShowDestinations<T extends { path: string; label: string }>(
  recents: readonly T[],
  publicShows: readonly (Pick<Show, "id"> & Partial<Pick<Show, "name">>)[],
): T[] {
  const publicShowLabels = new Map(
    publicShows.map((show) => [show.id, show.name?.trim() || "Show"] as const),
  );
  return recents.flatMap((recent): T[] => {
    if (!/^\/shows\//i.test(recent.path)) return [recent];
    const match = /^\/shows\/([^/?#]+)\/?(?:[?#].*)?$/i.exec(recent.path);
    if (!match) return [];
    try {
      const label = publicShowLabels.get(decodeURIComponent(match[1]));
      return label ? [{ ...recent, label } as T] : [];
    } catch {
      return [];
    }
  });
}

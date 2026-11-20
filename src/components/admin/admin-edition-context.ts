import type { Edition } from "@/lib/data";

/**
 * Resolve the Organizer edition only from the exact context identifier.
 *
 * Shared navigation must never manufacture edition context by falling back to
 * the newest loaded edition. A missing or stale context deliberately resolves
 * to null so edition-scoped destinations remain disabled/fail closed.
 */
export function resolveAdminEditionContext(
  editions: readonly Edition[],
  editionId: string | null | undefined,
): Edition | null {
  if (!editionId) return null;
  return editions.find((edition) => edition.id === editionId) ?? null;
}

/**
 * Match a complete edition route segment, not a shared slug prefix.
 * For example, /admin/entries/ssc22 must never select edition ssc2.
 */
const EDITION_ROUTE_FAMILIES = [
  "design",
  "edition-theme",
  "shows",
  "entries",
  "lineup-sync",
  "participant-status",
  "jury",
  "televote",
  "voting-system",
  "publication",
] as const;

export function matchesAdminEditionRoute(pathname: string, editionSlug: string): boolean {
  if (!editionSlug) return false;
  const normalized = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (normalized === `/admin/${editionSlug}`) return true;
  return EDITION_ROUTE_FAMILIES.some((family) => {
    const prefix = `/admin/${family}/${editionSlug}`;
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  });
}

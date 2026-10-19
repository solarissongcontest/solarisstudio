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

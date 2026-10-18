import type { Edition } from "@/lib/data";

/**
 * Resolve Organizer edition only from the exact context identifier.
 * Shared navigation must never manufacture context by falling back to the
 * newest loaded edition. Missing or stale context deliberately fails closed.
 */
export function resolveAdminEditionContext(
  editions: readonly Edition[],
  editionId: string | null | undefined,
): Edition | null {
  if (!editionId) return null;
  return editions.find((edition) => edition.id === editionId) ?? null;
}

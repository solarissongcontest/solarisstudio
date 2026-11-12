/**
 * Private Organizer projections must never be reused across accounts, even
 * when two organizers visit the same edition on a shared browser.
 * This key is client cache identity only; authorization stays server-side.
 */
export function organizerProjectionQueryKey(
  actorId: string,
  editionId: string | null | undefined,
) {
  const actor = actorId.trim();
  if (!actor) throw new Error("Organizer projection requires an authenticated actor");
  return ["v3-organizer-projection", actor, editionId?.trim() || "unscoped"] as const;
}

export type V3PrimaryRouteSurface = "home" | "participate";

/**
 * Decides whether the expensive shared bootstrap may load at all.
 *
 * The cheap server rollout probe runs first. Home can be public, but the first
 * V3 Participate slice is authenticated-only so a signed-out visitor stays on
 * legacy without paying for both V3 and legacy participation reads.
 */
export function shouldLoadV3PrimaryBundle(input: {
  isAppMode: boolean;
  surface: V3PrimaryRouteSurface;
  rolloutEnabled: boolean;
  rolloutUserId: string | null;
}) {
  if (!input.isAppMode || !input.rolloutEnabled) return false;
  if (input.surface === "participate" && !input.rolloutUserId) return false;
  return true;
}

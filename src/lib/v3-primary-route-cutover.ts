export type V3PrimaryRouteSurface = "home" | "participate";

/**
 * Resolves the V3 primary surface from the canonical router pathname.
 *
 * TanStack Router can retain the previous route component while a client-side
 * transition commits the new location. The V3 shell already reads that live
 * location, so trusting only the retained component prop can temporarily render
 * Home content with Participate selected in navigation (and vice versa).
 *
 * For the two primary cutover routes the canonical pathname therefore wins.
 * Unknown paths keep the declared surface so this helper cannot silently claim
 * ownership of nested/legacy destinations.
 */
export function resolveV3PrimarySurface(
  declaredSurface: V3PrimaryRouteSurface,
  pathname: string,
): V3PrimaryRouteSurface {
  const normalized = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  if (normalized === "/participate") return "participate";
  if (normalized === "/") return "home";
  return declaredSurface;
}

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

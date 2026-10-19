import {
  V3_ORGANIZER_TAB_ORDER,
  v3OrganizerTabRoot,
} from "@/lib/v3-organizer";

export type V3OrganizerTabbarMode = "full" | "compact" | "hidden";

function normalizeOrganizerPath(pathname: string) {
  if (!pathname || pathname === "/") return pathname;
  return pathname.endsWith("/") ? pathname.replace(/\/+$/, "") : pathname;
}

export function isV3OrganizerRootPath(pathname: string) {
  const normalized = normalizeOrganizerPath(pathname);
  return V3_ORGANIZER_TAB_ORDER.some(
    (tab) => normalizeOrganizerPath(v3OrganizerTabRoot(tab)) === normalized,
  );
}

/**
 * V3 owns morphology for the five canonical Organizer roots. Detail/workspace
 * routes inherit the legacy compact/hidden policy until their route owner
 * supplies a V3-specific presentation contract.
 */
export function resolveV3OrganizerTabbarMode(
  pathname: string,
  fallbackMode: V3OrganizerTabbarMode,
): V3OrganizerTabbarMode {
  return isV3OrganizerRootPath(pathname) ? "full" : fallbackMode;
}

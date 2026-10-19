import type { SolarisTabbarMode } from "@/lib/solaris-screen-contract";
import {
  V3_ORGANIZER_TAB_ORDER,
  v3OrganizerTabRoot,
} from "@/lib/v3-organizer";

/**
 * Organizer V3 consumes the canonical shell tab-bar contract instead of
 * maintaining a second union that can silently drift from screen registries.
 */
export type V3OrganizerTabbarMode = SolarisTabbarMode;

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
 * routes inherit the legacy compact/minimal/hidden policy until their route
 * owner supplies a V3-specific presentation contract.
 */
export function resolveV3OrganizerTabbarMode(
  pathname: string,
  fallbackMode: V3OrganizerTabbarMode,
): V3OrganizerTabbarMode {
  return isV3OrganizerRootPath(pathname) ? "full" : fallbackMode;
}

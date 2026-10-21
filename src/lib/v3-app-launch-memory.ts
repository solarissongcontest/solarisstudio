import {
  appEntryHref,
  getAppLaunchDestinationFromSnapshot,
  readAppNavigationState,
  type AppHistoryEntry,
} from "@/lib/app-navigation";
import { resolveSolarisAppScreen } from "@/lib/app-screen-registry";
import {
  markV3PublicNavigationRestore,
  readV3PublicNavigationState,
  type V3PublicHistoryEntry,
} from "@/lib/v3-public-navigation";

export const V3_APP_LAUNCH_RESTORE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

function launchEntryAllowed(entry: V3PublicHistoryEntry, signedIn: boolean) {
  if (
    !entry.pathname.startsWith("/") ||
    entry.pathname.startsWith("//") ||
    entry.pathname.includes("\\") ||
    /^\/(app-launch|auth|reset|recover|admin|organizer)(\/|$)/.test(entry.pathname)
  ) {
    return false;
  }

  const screen = resolveSolarisAppScreen(entry.pathname, entry.searchStr);
  if (
    screen.behavior.criticalTask ||
    screen.behavior.immersive ||
    screen.chrome.tabbar !== "full" ||
    (!signedIn && screen.access.auth === "authenticated")
  ) {
    return false;
  }

  const visitedAt = Date.parse(entry.visitedAt);
  const age = Date.now() - visitedAt;
  return (
    Number.isFinite(visitedAt) &&
    age >= 0 &&
    age <= V3_APP_LAUNCH_RESTORE_MAX_AGE_MS
  );
}

/**
 * Resolve the last safe V3 destination for the already-resolved viewer scope.
 * Returning null is deliberate: launch ownership then falls back to the
 * retained navigation snapshot rather than inventing a V3 destination.
 */
export function getV3PublicLaunchDestination(
  signedIn: boolean,
  storage?: StorageReader | null,
  scopeKey?: string | null,
): V3PublicHistoryEntry | null {
  const state = readV3PublicNavigationState(storage, scopeKey);
  const current = state.tabs[state.activeTab]?.current ?? null;
  if (!current || !launchEntryAllowed(current, signedIn)) return null;
  return current;
}

/**
 * Return retained memory only when the cold-launch resolver actually accepted
 * the stored entry. `getAppLaunchDestinationFromSnapshot()` intentionally
 * returns a freshly timestamped root when retained memory is stale, unsafe or
 * session-incompatible. That synthetic fallback is useful for navigation, but
 * it is not historical evidence and must never beat real V3 memory in a
 * recency comparison merely because it was created "now".
 */
export function getRetainedAppLaunchCandidateFromSnapshot(
  signedIn: boolean,
  navigationSnapshot: string | null,
): AppHistoryEntry | null {
  if (!navigationSnapshot) return null;

  const storage = { getItem: () => navigationSnapshot };
  const state = readAppNavigationState(storage);
  const stored = state.tabs[state.activeTab]?.current ?? null;
  if (!stored) return null;

  const resolved = getAppLaunchDestinationFromSnapshot(signedIn, navigationSnapshot);
  if (
    appEntryHref(resolved) !== appEntryHref(stored) ||
    resolved.visitedAt !== stored.visitedAt
  ) {
    return null;
  }

  return resolved;
}

/**
 * Cross-generation cold launch may select a retained navigation destination
 * while the V3 shell is active. Arm V3's one-shot scroll restore only when the
 * destination itself satisfies the same safe launch policy.
 */
export function markV3AppLaunchNavigationRestore(
  entry: V3PublicHistoryEntry,
  signedIn: boolean,
  storage?: StorageWriter | null,
  scopeKey?: string | null,
) {
  if (!launchEntryAllowed(entry, signedIn)) return false;
  markV3PublicNavigationRestore(entry, storage, scopeKey);
  return true;
}

export function preferV3AppLaunchDestination(
  legacy: V3PublicHistoryEntry | null,
  v3: V3PublicHistoryEntry | null,
) {
  if (!v3) return false;
  if (!legacy) return true;

  const legacyVisitedAt = Date.parse(legacy.visitedAt);
  const v3VisitedAt = Date.parse(v3.visitedAt);
  if (!Number.isFinite(v3VisitedAt)) return false;
  if (!Number.isFinite(legacyVisitedAt)) return true;
  return v3VisitedAt > legacyVisitedAt;
}

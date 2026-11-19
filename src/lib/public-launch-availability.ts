import type { SolarisFeatureFlag } from "./feature-flags";

/** Temporary public release scope; preserve hidden V3 implementations. */
export const LIMITED_PUBLIC_LAUNCH = true;
const LIMITED_PATH_PREFIXES = [
  "/participate", "/confirmations", "/jury-voting", "/televoting", "/auth", "/rules",
  "/my-solaris/entry", "/my-solaris/tasks", "/my-solaris/notices", "/my-solaris/voting",
] as const;
const LIMITED_DENIED_PREFIXES = [
  "/confirmations/admin", "/confirmations/next-in-line",
  "/televoting/admin", "/televoting/results",
] as const;

/** Public presentation policy for the deliberately scoped soft launch.
 * Evaluated server flags are the only opt-in. A null flag means this deferred
 * surface has no approved public rollout contract yet. No permission is granted.
 */
export const PUBLIC_LAUNCH_ROUTES = [
  { path: "/fantasy", flag: "fantasy_ssc" },
  { path: "/prediction-league", flag: "prediction_league" },
  { path: "/voting-dna", flag: "country_voting_dna" },
  { path: "/world", flag: "terra_world_public" },
  ...[
    "/predictions",
    "/my-solaris/predictions",
    "/archive-games",
    "/analysis",
    "/compare",
    "/relationships",
    "/result-lab",
    "/taste-dna",
    "/broadcast",
    "/broadcast-intelligence",
    "/scorecharts",
    "/pulse",
    "/next-in-line",
    // Compatibility route redirects to the deferred Next in Line command.
    "/confirmations/next-in-line",
    "/fans",
    "/tools",
    "/time-machine",
  ].map((path) => ({ path, flag: null })),
] as const satisfies readonly { path: string; flag: SolarisFeatureFlag | null }[];

export const PUBLIC_LAUNCH_FLAGS = [
  "fantasy_ssc",
  "prediction_league",
  "country_voting_dna",
  "terra_world_public",
] as const;
export type PublicLaunchFlags = Partial<Record<(typeof PUBLIC_LAUNCH_FLAGS)[number], boolean>>;

export function publicLaunchPath(href: string): string | null {
  if (
    !href.startsWith("/") ||
    href.startsWith("//") ||
    /\\/.test(href) ||
    [...href].some((char) => char.charCodeAt(0) <= 32)
  )
    return null;
  try {
    const url = new URL(href, "https://public-launch.invalid");
    if (url.origin !== "https://public-launch.invalid") return null;
    const path = decodeURIComponent(url.pathname);
    if (
      path.startsWith("//") ||
      /[%\\?#]/.test(path) ||
      [...path].some((char) => char.charCodeAt(0) < 32)
    )
      return null;
    return path.toLowerCase();
  } catch {
    return null;
  }
}

export function publicLaunchRequirement(href: string) {
  const path = publicLaunchPath(href);
  return path === null
    ? null
    : (PUBLIC_LAUNCH_ROUTES.find(
        (item) => path === item.path || path.startsWith(`${item.path}/`),
      ) ?? null);
}

export function limitedPublicLaunchAllows(href: string): boolean {
  const parsed = publicLaunchPath(href);
  if (parsed === null) return false;
  const path = parsed.length > 1 ? parsed.replace(/\/+$/, "") : parsed;
  if (/(^|\/)\.{1,2}(\/|$)/.test(path)) return false;
  if (path === "/") return true;
  const matches = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`);
  if (LIMITED_DENIED_PREFIXES.some(matches)) return false;
  return LIMITED_PATH_PREFIXES.some(matches);
}

export function standardPublicLaunchAllows(href: string, flags: PublicLaunchFlags = {}): boolean {
  if (publicLaunchPath(href) === null) return false;
  const requirement = publicLaunchRequirement(href);
  if (!requirement) return true;
  return requirement.flag !== null && flags[requirement.flag] === true;
}

/** User-visible launch decision. Keep the previous flag policy testable and reversible. */
export function publicLaunchAllows(href: string, flags: PublicLaunchFlags = {}): boolean {
  return LIMITED_PUBLIC_LAUNCH
    ? limitedPublicLaunchAllows(href)
    : standardPublicLaunchAllows(href, flags);
}

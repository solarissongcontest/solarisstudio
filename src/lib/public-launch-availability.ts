import type { SolarisFeatureFlag } from "./feature-flags";

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
    "/archive-games",
    "/analysis",
    "/compare",
    "/relationships",
    "/result-lab",
    "/taste-dna",
    "/broadcast",
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

export function publicLaunchAllows(href: string, flags: PublicLaunchFlags = {}): boolean {
  if (publicLaunchPath(href) === null) return false;
  const requirement = publicLaunchRequirement(href);
  if (!requirement) return true;
  return requirement.flag !== null && flags[requirement.flag] === true;
}

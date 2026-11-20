import {
  isMaintenancePublicAccountRouteAllowed,
  isMaintenancePublicWebsiteRouteAllowed,
} from "@/lib/maintenance";
import {
  PUBLIC_DESTINATIONS,
  publicSearchText,
  type PublicArea,
  type PublicDestination,
} from "@/lib/public-navigation";
import { matchesPublicDirectorySearch } from "./v3-public-directory-search";

export const SITE_DIRECTORY_AREA_ORDER: readonly PublicArea[] = [
  "explore",
  "participate",
  "results",
  "help",
  "me",
  "home",
];

export const SITE_DIRECTORY_AREA_LABELS: Record<PublicArea, string> = {
  home: "Home & updates",
  explore: "Explore",
  participate: "Participate",
  results: "Results",
  me: "Me",
  help: "Rules & help",
};

/** A short explanation of each navigation family, shared by all three clients. */
export const SITE_DIRECTORY_AREA_DESCRIPTIONS: Record<PublicArea, string> = {
  home: "What's happening now and the latest published updates.",
  explore: "Countries, editions, shows, stories and reference material.",
  participate: "Your available participation actions and responsibilities.",
  results: "Official published results, records and analyses.",
  me: "Your Solaris account, activity and personal history.",
  help: "Official rules, assistance and public guidance.",
};

export type SiteDirectoryArea = PublicArea | "all";

/**
 * The website, installed app and desktop directory must all consume the same
 * published navigation registry. Search never changes the underlying access
 * rules: a destination is merely a link, not a grant of permission.
 */
export function siteDirectoryDestinations(options: { releaseOnly?: boolean } = {}): PublicDestination[] {
  return PUBLIC_DESTINATIONS.filter((item) =>
    item.discoverable !== false &&
    (!options.releaseOnly ||
      isMaintenancePublicWebsiteRouteAllowed(item.to, "GET", true) ||
      isMaintenancePublicAccountRouteAllowed(item.to, "GET", true)),
  );
}

export function filterSiteDirectory(
  destinations: readonly PublicDestination[],
  query: string,
  area: SiteDirectoryArea = "all",
): PublicDestination[] {
  return destinations.filter((item) =>
    (area === "all" || item.area === area) &&
    matchesPublicDirectorySearch(query, [publicSearchText(item)]),
  );
}

export function siteDirectoryAreaCounts(destinations: readonly PublicDestination[]) {
  return SITE_DIRECTORY_AREA_ORDER.map((area) => ({
    area,
    label: SITE_DIRECTORY_AREA_LABELS[area],
    count: destinations.filter((item) => item.area === area).length,
  }));
}

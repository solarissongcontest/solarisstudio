import {
  PUBLIC_DESTINATIONS,
  publicSearchText,
  type PublicArea,
  type PublicDestination,
} from "@/lib/public-navigation";

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

export type SiteDirectoryArea = PublicArea | "all";

/**
 * The website, installed app and desktop directory must all consume the same
 * published navigation registry. Search never changes the underlying access
 * rules: a destination is merely a link, not a grant of permission.
 */
export function siteDirectoryDestinations(): PublicDestination[] {
  return PUBLIC_DESTINATIONS.filter((item) => item.discoverable !== false);
}

export function filterSiteDirectory(
  destinations: readonly PublicDestination[],
  query: string,
  area: SiteDirectoryArea = "all",
): PublicDestination[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return destinations.filter((item) =>
    (area === "all" || item.area === area) &&
    terms.every((term) => publicSearchText(item).includes(term)),
  );
}

export function siteDirectoryAreaCounts(destinations: readonly PublicDestination[]) {
  return SITE_DIRECTORY_AREA_ORDER.map((area) => ({
    area,
    label: SITE_DIRECTORY_AREA_LABELS[area],
    count: destinations.filter((item) => item.area === area).length,
  }));
}

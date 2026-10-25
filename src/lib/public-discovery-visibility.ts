import type { PublicDestination } from "@/lib/public-navigation";

export type PublicDiscoveryViewer = {
  authenticationState: "loading" | "anonymous" | "signed-in";
};

/**
 * Shared discovery policy for destination-backed Public surfaces.
 *
 * This is intentionally stricter than route authorization. Search and
 * directories must not advertise protected/contextual destinations merely
 * because the destination exists in the navigation registry. The destination
 * route remains authoritative for actual access.
 *
 * Destinations with explicit auth metadata follow that metadata. Contextual
 * destinations without an explicit public scope fail closed for anonymous or
 * unresolved viewers instead of becoming accidental public search snippets.
 */
export function visiblePublicDiscoveryDestinations(
  destinations: readonly PublicDestination[],
  viewer: PublicDiscoveryViewer,
) {
  return destinations.filter((destination) => {
    if (destination.discoverable === false) return false;

    switch (destination.auth) {
      case "signed-in":
        return viewer.authenticationState === "signed-in";
      case "hod":
      case "organizer":
        return false;
      case "public":
        if (destination.id !== "sign-in") return true;
        return viewer.authenticationState === "anonymous";
      default:
        if (destination.visibility === "contextual") {
          return viewer.authenticationState === "signed-in";
        }
        return true;
    }
  });
}

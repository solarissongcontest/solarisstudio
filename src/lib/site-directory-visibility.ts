import type { PublicDestination } from "@/lib/public-navigation";

export type SiteDirectoryViewer = {
  authenticationState: "loading" | "anonymous" | "signed-in";
};

/**
 * The Site Directory is a public discovery surface, not an authorization
 * oracle. It may expose ordinary public destinations plus the viewer's
 * signed-in Me entry point, but it must not advertise HOD/Organizer-only
 * destinations or keep offering Sign in after authentication.
 *
 * Route authorization remains authoritative at the destination itself. This
 * helper only decides what the public directory should teach the viewer.
 */
export function visibleSiteDirectoryDestinations(
  destinations: readonly PublicDestination[],
  viewer: SiteDirectoryViewer,
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
        return true;
    }
  });
}

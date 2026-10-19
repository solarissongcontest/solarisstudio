import type { PublicDestination } from "@/lib/public-navigation";

export type SiteDirectoryViewer = {
  signedIn: boolean;
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
        return viewer.signedIn;
      case "hod":
      case "organizer":
        return false;
      case "public":
        // `sign-in` is the one contextual public destination whose purpose
        // disappears after authentication. Other public destinations remain
        // valid for signed-in viewers too.
        return destination.id !== "sign-in" || !viewer.signedIn;
      default:
        return true;
    }
  });
}

import { describe, expect, it } from "vitest";

import type { PublicDestination } from "@/lib/public-navigation";
import { visibleSiteDirectoryDestinations } from "./site-directory-visibility";

function destination(
  id: string,
  auth?: PublicDestination["auth"],
  discoverable: boolean | undefined = true,
): PublicDestination {
  return {
    id,
    to: `/${id}`,
    area: "me",
    label: id,
    description: id,
    visibility: "secondary",
    ...(auth ? { auth } : {}),
    ...(discoverable === undefined ? {} : { discoverable }),
  };
}

const destinations: PublicDestination[] = [
  destination("ordinary"),
  destination("sign-in", "public"),
  destination("my-solaris", "signed-in"),
  destination("hod-workspace", "hod"),
  destination("organizer-workspace", "organizer"),
  destination("hidden-context", undefined, false),
];

describe("Site Directory visibility", () => {
  it("teaches anonymous viewers public destinations and Sign in, not signed-in/restricted work", () => {
    const visible = visibleSiteDirectoryDestinations(destinations, {
      authenticationState: "anonymous",
    }).map((item) => item.id);

    expect(visible).toEqual(["ordinary", "sign-in"]);
  });

  it("replaces Sign in with the signed-in Me destination after authentication", () => {
    const visible = visibleSiteDirectoryDestinations(destinations, {
      authenticationState: "signed-in",
    }).map((item) => item.id);

    expect(visible).toEqual(["ordinary", "my-solaris"]);
  });

  it("fails contextual account destinations closed while session state is unresolved", () => {
    const visible = visibleSiteDirectoryDestinations(destinations, {
      authenticationState: "loading",
    }).map((item) => item.id);

    expect(visible).toEqual(["ordinary"]);
  });

  it("never turns the public directory into discovery for HOD or Organizer-only routes", () => {
    for (const authenticationState of ["loading", "anonymous", "signed-in"] as const) {
      const visible = visibleSiteDirectoryDestinations(destinations, {
        authenticationState,
      });
      expect(visible.some((item) => item.auth === "hod" || item.auth === "organizer")).toBe(false);
    }
  });

  it("continues honoring the canonical discoverable flag before auth filtering", () => {
    const visible = visibleSiteDirectoryDestinations(destinations, {
      authenticationState: "signed-in",
    });
    expect(visible.some((item) => item.id === "hidden-context")).toBe(false);
  });
});

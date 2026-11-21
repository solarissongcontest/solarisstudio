import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PUBLIC_GLOBAL_AREAS, PUBLIC_RELEASE_GLOBAL_AREAS } from "./public-navigation";
import { GLOBAL_MAINTENANCE_MODE, isMaintenancePublicWebsiteRouteAllowed } from "./maintenance";
import { LIMITED_PUBLIC_LAUNCH, limitedPublicLaunchAllows } from "./public-launch-availability";

const app = readFileSync("src/components/AppShell.tsx", "utf8");
const dock = readFileSync("src/components/app/AppTabBar.tsx", "utf8");
const drawer = readFileSync("src/components/public/PublicSiteNavigation.tsx", "utf8");
const worker = readFileSync("src/server.ts", "utf8");
const v3Shell = readFileSync("src/components/v3/V3AppShell.tsx", "utf8");
const previewProvider = readFileSync("src/components/public/PublicLaunchAvailability.tsx", "utf8");

describe("P0 limited release restricts public navigation, including installed tab gestures", () => {
  it("preserves future navigation catalogs but opens only Home and Participate tabs", () => {
    expect(PUBLIC_GLOBAL_AREAS.map((x) => x.id)).toEqual(["home", "explore", "participate", "results", "me"]);
    expect(PUBLIC_RELEASE_GLOBAL_AREAS.map((x) => x.id)).toEqual(["home", "participate", "me"]);
    expect(GLOBAL_MAINTENANCE_MODE).toBe(false);
    expect(LIMITED_PUBLIC_LAUNCH).toBe(true);
    expect(PUBLIC_GLOBAL_AREAS.filter((x) => limitedPublicLaunchAllows(x.to)).map((x) => x.id))
      .toEqual(["home", "participate"]);
  });

  it("binds web chrome and iOS dock/drag gestures to the active limited allowlist", () => {
    expect(app).toContain("publicGlobalAreasForContext(publicUser).filter((area) => publicUser.organizer || publicLaunchAllows(area.to))");
    expect(drawer).toContain("publicGlobalAreasForContext(user).filter((item) => allows(item.to))");
    expect(dock).toContain("const LAUNCH_TAB_AREAS = PUBLIC_GLOBAL_AREAS.filter((area) => publicLaunchAllows(area.to))");
    expect(dock).toContain("itemCount: tabAreas.length");
    expect(dock).toContain("const area = tabAreas[targetIndex]");
    expect(dock).toContain("const tabAreas = adminPreview ? PUBLIC_GLOBAL_AREAS : LAUNCH_TAB_AREAS");
    expect(app).toContain("adminPreview={publicUser.organizer}");
    expect(worker).toContain("!limitedPublicLaunchAllows(url.pathname)");
    expect(v3Shell).toContain("usePublicLaunchAvailability()");
    expect(v3Shell).toContain("allowsReleased(destination.to)");
    expect(previewProvider).toContain("organizer.isSuccess &&");
    expect(previewProvider).toContain("!organizer.isFetching && !organizer.isError && organizer.data === true");
  });

  it("denies Explore, Results and Me on the actual limited launch, and maintains emergency denials", () => {
    for (const path of ["/explore", "/results", "/results/ssc-20", "/me", "/my-solaris"]) {
      expect(limitedPublicLaunchAllows(path)).toBe(false);
    }
    for (const path of ["/", "/participate", "/auth", "/rules"]) {
      expect(limitedPublicLaunchAllows(path)).toBe(true);
    }
    for (const path of ["/explore", "/results"]) {
      expect(isMaintenancePublicWebsiteRouteAllowed(path, "GET", true)).toBe(false);
    }
  });
});

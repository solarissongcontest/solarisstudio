import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GLOBAL_MAINTENANCE_MODE,
  MAINTENANCE_PUBLIC_PRIMARY_AREAS,
  isMaintenancePublicWebsiteRouteAllowed,
  isMaintenancePublicAccountRouteAllowed,
  isMaintenanceHodAppRouteAllowed,
} from "./maintenance";

const tabbar = readFileSync("src/components/app/AppTabBar.tsx", "utf8");
const shell = readFileSync("src/components/AppShell.tsx", "utf8");
const drawer = readFileSync("src/components/public/PublicSiteNavigation.tsx", "utf8");
const more = readFileSync("src/components/app/AppMoreNavigation.tsx", "utf8");
const styles = readFileSync("src/styles/app-shell.css", "utf8");

describe("emergency release only exposes Home Participate and Me", () => {
  it("allows exactly three public route roots", () => {
    expect(GLOBAL_MAINTENANCE_MODE).toBe(true);
    expect([...MAINTENANCE_PUBLIC_PRIMARY_AREAS]).toEqual(["home", "participate", "me"]);
    for (const path of ["/", "/participate", "/participate/", "/me", "/me/", "/my-solaris", "/my-solaris/"]) {
      expect(isMaintenancePublicWebsiteRouteAllowed(path, "GET", true), path).toBe(true);
      expect(isMaintenancePublicWebsiteRouteAllowed(path, "HEAD", true), path).toBe(true);
      expect(isMaintenancePublicWebsiteRouteAllowed(path, "POST", true), path).toBe(false);
      expect(isMaintenancePublicWebsiteRouteAllowed(path, "GET", false), path).toBe(false);
    }
  });
  it("blocks Explore, Results, archives and sensitive control pages at the Worker", () => {
    for (const path of [
      "/explore", "/explore/", "/results", "/results/ssc-20",
      "/countries", "/countries/ABE", "/editions", "/editions/ssc-20",
      "/shows", "/wiki", "/encyclopedia", "/archive", "/rules",
      "/site-directory", "/admin", "/jury-voting", "/televoting",
      "/participate/jury", "/api/admin", "/_serverFn",
    ]) {
      expect(isMaintenancePublicWebsiteRouteAllowed(path, "GET", true), path).toBe(false);
    }
    expect(isMaintenancePublicAccountRouteAllowed("/auth", "GET", true)).toBe(true);
    expect(isMaintenanceHodAppRouteAllowed("/confirmations/edit/example", "GET", true)).toBe(true);
  });
  it("presents exactly three tabs on all website and installed-app nav shells", () => {
    expect(shell).toContain("MAINTENANCE_PUBLIC_PRIMARY_AREAS");
    expect(shell).toContain('GLOBAL_MAINTENANCE_MODE ? "grid-cols-3" : "grid-cols-5"');
    expect(drawer).toContain("MAINTENANCE_PUBLIC_PRIMARY_AREAS");
    expect(tabbar).toContain("VISIBLE_APP_AREAS.map");
    expect(tabbar).toContain("data-visible-tab-count={VISIBLE_APP_AREAS.length}");
    expect(styles).toContain('.solaris-app-tabbar-material[data-visible-tab-count="3"]');
    expect(more).toContain("!GLOBAL_MAINTENANCE_MODE ? LINKS.map");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PUBLIC_RELEASE_GLOBAL_AREAS, PUBLIC_GLOBAL_AREAS } from "./public-navigation";
import { isMaintenancePublicWebsiteRouteAllowed, GLOBAL_MAINTENANCE_MODE } from "./maintenance";
const app = readFileSync("src/components/AppShell.tsx", "utf8");
const dock = readFileSync("src/components/app/AppTabBar.tsx", "utf8");
const drawer = readFileSync("src/components/public/PublicSiteNavigation.tsx", "utf8");
const css = readFileSync("src/styles/app-shell.css", "utf8");

describe("P0 published navigation is only Home Participate Me", () => {
  it("preserves the future five-tab catalog separately", () => {
    expect(PUBLIC_GLOBAL_AREAS.map(x => x.id)).toEqual(["home","explore","participate","results","me"]);
    expect(PUBLIC_RELEASE_GLOBAL_AREAS.map(x => x.id)).toEqual(["home","participate","me"]);
    expect(GLOBAL_MAINTENANCE_MODE).toBe(true);
  });
  it("filters mobile web, drawer, and installed Liquid Glass dock", () => {
    expect(app).toContain("PUBLIC_RELEASE_GLOBAL_AREAS.some(");
    expect(app).toContain('GLOBAL_MAINTENANCE_MODE ? "grid-cols-3" : "grid-cols-5"');
    expect(drawer).toContain("PUBLIC_RELEASE_GLOBAL_AREAS.some(");
    expect(dock).toContain("const NAV_AREAS = GLOBAL_MAINTENANCE_MODE ? PUBLIC_RELEASE_GLOBAL_AREAS : PUBLIC_GLOBAL_AREAS");
    expect(dock).toContain("data-public-tab-count={NAV_AREAS.length}");
    expect(dock).toContain("itemCount: NAV_AREAS.length");
    expect(css).toContain('data-public-tab-count="3"');
    expect(css).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
  });
  it("keeps the currently unreleased Explore and Results roots closed", () => {
    for (const path of ["/explore","/explore/","/results","/results/ssc-20",
      "/countries","/countries/ABE","/editions/ssc-20","/shows","/wiki",
      "/archive","/records","/scorecharts"]) {
      expect(isMaintenancePublicWebsiteRouteAllowed(path,"GET",true)).toBe(false);
    }
    for (const path of ["/","/participate","/me","/my-solaris","/site-directory","/rules"]) {
      expect(isMaintenancePublicWebsiteRouteAllowed(path,"GET",true)).toBe(true);
    }
  });
});

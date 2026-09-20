import { describe, expect, it } from "vitest";

import {
  PUBLIC_DESTINATIONS,
  PUBLIC_GLOBAL_AREAS,
  publicAreaForPath,
  publicSearchText,
} from "./public-navigation";

describe("public navigation contract", () => {
  it("keeps the five stable global areas", () => {
    expect(PUBLIC_GLOBAL_AREAS.map((area) => area.id)).toEqual([
      "home",
      "explore",
      "participate",
      "results",
      "me",
    ]);
  });

  it("gives every destination a unique id and canonical route", () => {
    const ids = PUBLIC_DESTINATIONS.map((item) => item.id);
    const routes = PUBLIC_DESTINATIONS.map((item) => item.to);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("assigns every destination an area and visibility level", () => {
    for (const item of PUBLIC_DESTINATIONS) {
      expect(item.area).toMatch(/^(home|explore|participate|results|me|help)$/);
      expect(item.visibility).toMatch(/^(primary|secondary|advanced|contextual)$/);
    }
  });

  it("keeps advanced result tools out of global navigation", () => {
    const globalRoutes = new Set(PUBLIC_GLOBAL_AREAS.map((area) => area.to));
    for (const route of [
      "/compare",
      "/result-lab",
      "/taste-dna",
      "/broadcast-intelligence",
      "/relationships",
      "/predictions",
    ]) {
      expect(globalRoutes.has(route)).toBe(false);
    }
  });

  it("preserves old terminology as search aliases", () => {
    const byRoute = new Map(PUBLIC_DESTINATIONS.map((item) => [item.to, item]));
    expect(publicSearchText(byRoute.get("/integrity/preclearance")!)).toContain("preclearance");
    expect(publicSearchText(byRoute.get("/broadcast-intelligence")!)).toContain(
      "broadcast intelligence",
    );
    expect(publicSearchText(byRoute.get("/rules/interpretations")!)).toContain("interpretations");
    expect(publicSearchText(byRoute.get("/taste-dna")!)).toContain("taste dna");
  });

  it("keeps the anniversary archive route contextual and out of year-round discovery", () => {
    const anniversary = PUBLIC_DESTINATIONS.find((item) => item.to === "/anniversary");
    expect(anniversary?.visibility).toBe("contextual");
    expect(anniversary?.discoverable).toBe(false);
  });

  it("maps representative deep routes to the conceptual area", () => {
    expect(publicAreaForPath("/countries/oland")).toBe("explore");
    expect(publicAreaForPath("/scorecharts/ssc21-final")).toBe("results");
    expect(publicAreaForPath("/integrity/appeals/case-1")).toBe("help");
    expect(publicAreaForPath("/televoting/how-to-vote")).toBe("participate");
    expect(publicAreaForPath("/my-solaris/country")).toBe("me");
  });
});

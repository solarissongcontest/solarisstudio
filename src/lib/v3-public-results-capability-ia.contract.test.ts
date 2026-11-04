import { describe, expect, it } from "vitest";

import { PUBLIC_DESTINATIONS } from "./public-navigation";
import { V3_PUBLIC_CAPABILITY_REGISTRY } from "./v3-public-capability-registry";

const RESULT_ANALYSIS_DESTINATIONS = [
  "/analysis",
  "/compare",
  "/tools",
  "/voting-dna",
] as const;

describe("V3 Public Results capability information architecture", () => {
  it("keeps result-analysis destinations in the canonical Results area", () => {
    for (const path of RESULT_ANALYSIS_DESTINATIONS) {
      const destination = PUBLIC_DESTINATIONS.find((item) => item.to === path);

      expect(destination, `${path} must remain registered in public navigation`).toBeDefined();
      expect(destination?.area, `${path} must remain owned by Results`).toBe("results");
    }
  });

  it("keeps the migration registry aligned with canonical navigation ownership", () => {
    const explore = V3_PUBLIC_CAPABILITY_REGISTRY.find((item) => item.id === "explore-root");
    const results = V3_PUBLIC_CAPABILITY_REGISTRY.find((item) => item.id === "results");

    expect(explore).toBeDefined();
    expect(results).toBeDefined();
    expect(explore?.targetArea).toBe("explore");
    expect(results?.targetArea).toBe("results");

    for (const path of RESULT_ANALYSIS_DESTINATIONS) {
      const routeFamily = `${path}/*`;

      expect(explore?.legacyRoutes, `Explore must not claim ${routeFamily}`).not.toContain(routeFamily);
      expect(results?.legacyRoutes, `Results must claim ${routeFamily}`).toContain(routeFamily);
    }
  });
});

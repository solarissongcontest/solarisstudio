import { describe, expect, it } from "vitest";
import { V3_PUBLIC_CAPABILITY_REGISTRY } from "./v3-public-capability-registry";

const RESULT_ANALYSIS_ROUTE_FAMILIES = [
  "/analysis/*",
  "/compare/*",
  "/voting-dna/*",
] as const;

describe("V3 Public result-analysis capability ownership", () => {
  const results = V3_PUBLIC_CAPABILITY_REGISTRY.find((capability) => capability.id === "results");
  const explore = V3_PUBLIC_CAPABILITY_REGISTRY.find((capability) => capability.id === "explore-root");

  it("keeps canonical result-analysis route families owned by Results exactly once", () => {
    expect(results).toBeDefined();
    expect(explore).toBeDefined();

    for (const route of RESULT_ANALYSIS_ROUTE_FAMILIES) {
      expect(results?.legacyRoutes).toContain(route);
      expect(explore?.legacyRoutes).not.toContain(route);

      const owners = V3_PUBLIC_CAPABILITY_REGISTRY.filter((capability) =>
        capability.legacyRoutes.some((candidate) => candidate === route),
      );
      expect(owners.map((capability) => capability.id)).toEqual(["results"]);
    }
  });

  it("retains the mixed-purpose tools family under Explore", () => {
    expect(explore?.legacyRoutes).toContain("/tools/*");
    expect(results?.legacyRoutes).not.toContain("/tools/*");
  });
});

import { describe, expect, it } from "vitest";

import {
  V3_PUBLIC_CAPABILITIES,
  V3_PUBLIC_PLANNED_CAPABILITIES,
  V3_PUBLIC_ROUTE_DISCOVERED_CAPABILITIES,
} from "./v3-capability-registry";

describe("V3 Jury Share capability registry", () => {
  it("registers Jury Share as canonical new Results work rather than a fake legacy-route discovery", () => {
    const capability = V3_PUBLIC_CAPABILITIES.find(
      (item) => item.id === "results.jury_share_card",
    );

    expect(capability).toMatchObject({
      id: "results.jury_share_card",
      backendOwners: ["results", "jury", "publication"],
      authRequirement: "optional",
      classification: "contextualize",
      targetArea: "results",
      targetRoute: "/results/jury-share",
      specificationStatus: "building",
      acceptanceScenarioId: "public.jury-share-card-publication-safe",
    });
    expect(capability?.legacyRoutes).toEqual([]);
    expect(
      V3_PUBLIC_PLANNED_CAPABILITIES.some(
        (item) => item.id === "results.jury_share_card",
      ),
    ).toBe(true);
    expect(
      V3_PUBLIC_ROUTE_DISCOVERED_CAPABILITIES.some(
        (item) => item.id === "results.jury_share_card",
      ),
    ).toBe(false);
  });

  it("keeps the capability below parity while ordered System and Public integration is still active", () => {
    const capability = V3_PUBLIC_PLANNED_CAPABILITIES.find(
      (item) => item.id === "results.jury_share_card",
    );

    expect(capability?.specificationStatus).toBe("building");
    expect(capability?.migrationEvidence).toContain(
      "System publication/authorization projection",
    );
    expect(capability?.migrationEvidence).toContain(
      "Public Results image consumer",
    );
  });
});

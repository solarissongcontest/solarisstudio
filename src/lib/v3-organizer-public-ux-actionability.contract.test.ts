import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const route = readFileSync("src/routes/_authenticated/admin/public-ux.tsx", "utf8");
const panel = readFileSync("src/components/admin/PublicUxActionability.tsx", "utf8");
const findings = readFileSync("src/lib/public-ux-findings.ts", "utf8");

describe("V3 Organizer Public UX actionability", () => {
  it("surfaces prioritized findings without replacing the existing dashboard", () => {
    expect(route).toContain("PublicUxActionabilityPanel");
    expect(route).toContain("metrics={metrics}");
    expect(route).toContain("vitalRows={vitals?.routes ?? []}");
    expect(route).toContain('title="Core Web Vitals"');
    expect(route).toContain('title="Most used destinations"');
    expect(route).toContain('title="Findability"');
    expect(route).toContain('title="Start → completion"');
  });

  it("keeps the canonical missing server signals visibly unknown instead of fake zeroes", () => {
    for (const signal of [
      "Route backtracking",
      "Dead ends",
      "Workflow abandonment",
      "Error classes",
    ]) {
      expect(findings).toContain(`"${signal}"`);
    }
    expect(panel).toContain("Canonical signals still unavailable");
    expect(panel).toContain("Missing server signals are still unknown, not zero");
    expect(panel).toContain("System request #753");
  });

  it("derives actions only from aggregate metrics already provided by the server", () => {
    expect(findings).toContain("metrics.search.noResults");
    expect(findings).toContain("metrics.search.submitted");
    expect(findings).toContain("metrics.tasks");
    expect(findings).toContain("metrics.friction.highStepSessions");
    expect(findings).toContain("metrics.friction.repeatedSectionSessions");
    expect(findings).toContain("vitalRows");
    expect(findings).not.toContain("rawQuery");
    expect(findings).not.toContain("sessionEvents");
  });

  it("retains Public UX as an accepted bounded observational cutover", () => {
    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "workspace-public-ux",
    );
    expect(capability?.targetDomain).toBe("product-qa");
    expect(capability?.migrationStatus).toBe("cutover");
    expect(capability?.migrationEvidence).toContain("v3-organizer-specialist-acceptance.contract.test.ts");
    expect(capability?.migrationEvidence).toContain("public-ux-metrics.ts");
  });
});

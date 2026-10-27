import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

function capability(id: string) {
  const entry = V3_ORGANIZER_CAPABILITY_REGISTRY.find((item) => item.legacyId === id);
  if (!entry) throw new Error(`Missing Organizer capability ${id}`);
  return entry;
}

function domain(id: string) {
  return capability(id).targetDomain;
}

describe("V3 Organizer canonical domain ownership", () => {
  it("keeps specialist labs separate from ordinary live production", () => {
    expect(domain("live-review-simulation-lab")).toBe("specialist-labs");
    expect(domain("live-review-time-machine")).toBe("specialist-labs");
    expect(domain("live-review-voting-lab")).toBe("specialist-labs");
    expect(domain("workspace-command-assistant")).toBe("specialist-labs");
  });

  it("groups engagement and editorial tools together", () => {
    expect(domain("current-edition-storytelling")).toBe("engagement-editorial");
    expect(domain("workspace-anniversary-settings")).toBe("engagement-editorial");
    expect(domain("workspace-anniversary-dates")).toBe("engagement-editorial");
    expect(domain("workspace-predictions")).toBe("engagement-editorial");
    expect(domain("workspace-fantasy")).toBe("engagement-editorial");
    expect(domain("workspace-community-moderation")).toBe("engagement-editorial");
  });

  it("keeps Product QA surfaces out of generic platform ownership", () => {
    expect(domain("workspace-flag-qa")).toBe("product-qa");
    expect(domain("workspace-public-ux")).toBe("product-qa");
    expect(domain("workspace-acceptance-test")).toBe("product-qa");
    expect(domain("workspace-beta-coverage")).toBe("product-qa");
    expect(domain("workspace-beta-3-feedback")).toBe("product-qa");
    expect(domain("workspace-beta-2-feedback")).toBe("product-qa");
    expect(domain("workspace-beta-1-archive")).toBe("product-qa");
  });

  it("preserves accepted Product QA ownership and inspectable cutover evidence", () => {
    const coverage = capability("workspace-beta-coverage");

    expect(coverage.ownerCapability).toBe("rollout.manage");
    expect(coverage.migrationStatus).toBe("cutover");
    expect(coverage.migrationEvidence).toContain("v3-organizer-specialist-acceptance.contract.test.ts");
    expect(coverage.migrationEvidence).toContain("AdminQaCoveragePage.tsx");
  });

  it("keeps publication with voting/results and production configuration separate from live review", () => {
    expect(domain("current-edition-publish")).toBe("voting-results");
    expect(domain("current-edition-broadcast")).toBe("production");
    expect(domain("live-review-broadcast-rundown")).toBe("live-production");
    expect(domain("live-review-reveal-director")).toBe("live-production");
  });

  it("keeps Eligibility and Media in Contest while confirmations remain Delegations", () => {
    expect(domain("operations-eligibility")).toBe("contest");
    expect(domain("operations-media-assets")).toBe("contest");
    expect(domain("delegation-confirmation-overview")).toBe("delegations");
  });
});

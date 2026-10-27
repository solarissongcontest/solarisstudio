import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const route = source("src/routes/_authenticated/admin/media-assets.tsx");
const service = source("src/lib/studio2-media-assets.ts");

describe("V3 Organizer Media Review exact-edition safety", () => {
  it("fails closed instead of selecting a newest fallback edition", () => {
    expect(route).toContain("selectOrganizerEdition(editions, editionId)");
    expect(route).not.toContain("sort((a, b) => (b.edition_number");
    expect(route).toContain("enabled: Boolean(resolvedEditionId)");
    expect(route).toContain("will not substitute the newest edition");
  });

  it("rejects cross-edition review evidence and clears stale bulk state", () => {
    expect(route).toContain("review.editionId !== resolvedEditionId");
    expect(route).toContain("setSelectedKeys(new Set())");
    expect(route).toContain("setReviewReason('')");
    expect(route).toContain("current.editionId !== review.commandEditionId");
    expect(route).toContain("current.sourceFingerprint !== reviewed.sourceFingerprint");
    expect(service).toContain("mapReviewsForEdition(data, editionId)");
    expect(service).toContain("review.editionId !== editionId");
    expect(service).toContain("mapReviewsForEdition(data, input.editionId)");
  });

  it("binds review mutation and reconciliation to the captured edition", () => {
    expect(route).toContain("selectedEdition.id !== review.commandEditionId || editionId !== review.commandEditionId");
    expect(route).toContain("editionId: review.commandEditionId");
    expect(route).toContain("variables.commandEditionId");
    expect(route).toContain("if (editionId !== variables.commandEditionId) return;");
    expect(service).toContain("p_edition_id: input.editionId");
  });

  it("retains the accepted Media Review cutover with explicit owner evidence", () => {
    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "operations-media-assets",
    );
    expect(capability?.targetDomain).toBe("contest");
    expect(capability?.migrationStatus).toBe("cutover");
    expect(capability?.migrationEvidence).toContain("v3-organizer-specialist-acceptance.contract.test.ts");
    expect(capability?.migrationEvidence).toContain("studio2-media-assets.test.ts");
  });
});

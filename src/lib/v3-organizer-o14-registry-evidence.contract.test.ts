import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function statusFor(legacyId: string) {
  return V3_ORGANIZER_CAPABILITY_REGISTRY.find((item) => item.legacyId === legacyId)?.migrationStatus;
}

describe("V3 Organizer platform and anniversary capability evidence", () => {
  it("reports Feature Rollout as building from the merged reviewed production-control boundary", () => {
    const route = source("src/routes/_authenticated/admin/feature-rollout.tsx");
    const reviewContract = source("src/lib/v3-organizer-feature-rollout-review.contract.test.ts");

    expect(statusFor("workspace-feature-rollout")).toBe("building");
    expect(route).toContain("prepareRolloutReview(row)");
    expect(route).toContain("<AdminConfirmSheet");
    expect(route).toContain("const freshRows = await loadFlags()");
    expect(route).toContain("!sameFlagSnapshot(live, pending.baseline)");
    expect(route).toContain("System #1178 owns that canonical command gap");
    expect(reviewContract).toContain("re-reads rollout state and recomputes dependency legality immediately before apply");
  });

  it("reports All Editions as building while recording the governed lifecycle cutover", () => {
    const route = source("src/routes/_authenticated/admin/editions.tsx");
    const workspace = source("src/components/admin/AllEditionsWorkspaceV3.tsx");
    const reviewContract = source("src/lib/v3-organizer-edition-destructive-review.contract.test.ts");
    const lifecycle = source("supabase/migrations/20261020092500_v3_all_editions_lifecycle_authority.sql");

    // System #1068 is implemented here, but the Organizer registry owner still
    // controls final parity/cutover promotion after exact-head integration evidence.
    expect(statusFor("workspace-all-editions")).toBe("building");
    expect(route).toContain("AllEditionsWorkspaceV3");
    expect(workspace).toContain("previewEditionMakePrivateV3");
    expect(workspace).toContain("createEditionDraftV3");
    expect(lifecycle).toContain("'edition.make_private'");
    expect(lifecycle).toContain("'edition.create_draft'");
    expect(reviewContract).toContain("retires permanent browser deletion instead of cascading historical truth");
  });

  it("reports Anniversary Dates as building from the merged conditional review boundary", () => {
    const route = source("src/routes/_authenticated/admin/anniversary-dates.tsx");
    const reviewContract = source("src/lib/v3-organizer-anniversary-date-review.contract.test.ts");

    expect(statusFor("workspace-anniversary-dates")).toBe("building");
    expect(route).toContain("prepareDateReview(edition)");
    expect(route).toContain("applyReviewedDate");
    expect(route).toContain("changed immediately before apply, so the reviewed date was not written");
    expect(route).toContain("System #633 still owns the canonical versioned, idempotent");
    expect(reviewContract).toContain("guards the legacy write against a race after the live read");
  });

  it("does not promote the still-ungoverned System Settings surface", () => {
    expect(statusFor("workspace-system-settings")).toBe("planned");
  });

  it("keeps registry promotion separate from implementation evidence until integrator certification", () => {
    expect(statusFor("workspace-feature-rollout")).not.toBe("parity");
    expect(statusFor("workspace-all-editions")).not.toBe("parity");
    expect(statusFor("workspace-anniversary-dates")).not.toBe("parity");
  });
});

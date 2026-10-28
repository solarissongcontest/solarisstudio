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

  it("reports All Editions as building from the merged reviewed lifecycle boundary", () => {
    const route = source("src/routes/_authenticated/admin/editions.tsx");
    const reviewContract = source("src/lib/v3-organizer-edition-destructive-review.contract.test.ts");

    expect(statusFor("workspace-all-editions")).toBe("building");
    expect(route).toContain("prepareEditionLifecycleReview");
    expect(route).toContain("revalidateEditionLifecycleReview");
    expect(route).toContain("Edition state changed after this review opened");
    expect(route).toContain("await applyReviewedEditionPublication(review, applyShowPublicationChange)");
    expect(route).toContain("This multi-show batch is not atomic; partial progress may exist");
    expect(route).not.toMatch(/\.from\("editions"\)\s*\.(?:update|delete)/);
    expect(reviewContract).toContain("prohibits permanent edition deletion");
    expect(reviewContract).toContain("re-reads exact edition dependencies and fails closed on review drift");
  });

  it("reports Anniversary Dates as building from the merged conditional review boundary", () => {
    const route = source("src/routes/_authenticated/admin/anniversary-dates.tsx");
    const reviewContract = source("src/lib/v3-organizer-anniversary-date-review.contract.test.ts");

    expect(statusFor("workspace-anniversary-dates")).toBe("building");
    expect(route).toContain("prepareDateReview(edition)");
    expect(route).toContain("applyReviewedDate");
    // Preserve reviewed, edition-bound date persistence. The canonical command
    // now owns CAS/receipt recovery instead of a conditional browser UPDATE.
    expect(route).toContain("await applyEditionMetadataChange({");
    expect(route).toContain("editionId: pendingReview.editionId");
    expect(route).toContain("expectedRevision: Number(live.data_revision)");
    expect(route).toContain("receipt.edition.data_revision");
    expect(reviewContract).toContain("uses the canonical metadata command with exact reviewed scope and server CAS");
    expect(route).not.toMatch(/\.from\("editions"\)\s*\.update/);
  });

  it("reports System Settings as building from the merged exact-edition reminder boundary", () => {
    const reminderContract = source("src/lib/v3-organizer-system-reminder-scope.contract.test.ts");

    expect(statusFor("workspace-system-settings")).toBe("building");
    expect(reminderContract).toContain("binds reminder reads to the live Organizer edition");
    expect(reminderContract).toContain("binds the operational schedule to the same live Organizer edition");
    expect(reminderContract).toContain("re-reads a reminder and narrows completion updates by edition and prior state");
    expect(reminderContract).toContain("does not pretend compatibility reminder CRUD closes System #1074");
  });

  it("keeps every evidence-backed mutation surface in this slice below parity while System gaps remain open", () => {
    expect(statusFor("workspace-feature-rollout")).not.toBe("parity");
    expect(statusFor("workspace-all-editions")).not.toBe("parity");
    expect(statusFor("workspace-anniversary-dates")).not.toBe("parity");
    expect(statusFor("workspace-system-settings")).not.toBe("parity");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/integrity-appeals.tsx"),
  "utf8",
);

describe("V3 Organizer exceptional appeal extension review", () => {
  it("freezes the reviewed appeal state, deadline and reason before confirmation", () => {
    expect(route).toContain("type AppealExtensionReview = {");
    expect(route).toContain("baselineFingerprint: string;");
    expect(route).toContain("proposedDeadline: proposedDeadline.toISOString()");
    expect(route).toContain("reason: reason.trim()");
    expect(route).toContain("baselineFingerprint: appealExtensionReviewFingerprint(appeal)");
    expect(route).toContain("open={Boolean(pendingReview)}");
    expect(route).toContain("pendingReview.proposedDeadline");
    expect(route).toContain("pendingReview.reason");
  });

  it("re-reads the exact appeal and rejects drift before the compatibility mutation", () => {
    const reread = route.indexOf("const currentAppeals = await loadAppeals()");
    const compare = route.indexOf(
      "appealExtensionReviewFingerprint(currentAppeal) !== review.baselineFingerprint",
    );
    const legacyMutation = route.indexOf(
      'return rpc("admin_grant_integrity_appeal_extension"',
    );

    expect(reread).toBeGreaterThan(-1);
    expect(compare).toBeGreaterThan(reread);
    expect(legacyMutation).toBeGreaterThan(compare);
    expect(route).toContain('currentAppeal.status !== "rejected_late"');
    expect(route).toContain("extensionGrantedAt: appeal.extension_granted_at");
    expect(route).toContain("extensionReason: appeal.extension_reason");
    expect(route).toContain("decidedAt: appeal.decided_at");
    expect(route).toContain(
      "This appeal changed while the extension review was open. Nothing was changed.",
    );
  });

  it("does not silently substitute refreshed state into the reviewed operation", () => {
    expect(route).toContain("_appeal_id: review.appealId");
    expect(route).toContain("_new_deadline: review.proposedDeadline");
    expect(route).toContain("_reason: review.reason");
    expect(route).not.toContain("_new_deadline: currentAppeal.deadline_at");
    expect(route).not.toContain("_reason: currentAppeal.extension_reason");
  });

  it("keeps the missing canonical System command visible instead of claiming parity", () => {
    expect(route).toContain("System #947");
    expect(route).toContain("version/CAS, idempotency and receipt authority");

    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "trust-appeals",
    );
    expect(capability?.migrationStatus).toBe("building");
  });
});

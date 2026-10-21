import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const route = readFileSync(
  "src/routes/_authenticated/admin/integrity-evidence.tsx",
  "utf8",
);
const lifecycle = readFileSync(
  "supabase/functions/integrity-evidence-lifecycle/index.ts",
  "utf8",
);

describe("V3 Organizer Evidence lifecycle review freshness", () => {
  it("freezes the exact due-evidence basis that the organizer reviewed", () => {
    expect(route).toContain("type DueEvidenceReview");
    expect(route).toContain("dueEvidenceReviewFingerprint");
    expect(route).toContain("item: { ...item }");
    expect(route).toContain("fingerprint: dueEvidenceReviewFingerprint(item)");
    expect(route).toContain("data-v3-organizer-evidence-deletion-review");
    expect(route).toContain("reviewedItem.case_code");
    expect(route).toContain("reviewedItem.deletion_reason");
    expect(route).toContain("reviewedItem.retention_until");
  });

  it("re-reads authoritative due eligibility immediately before permanent deletion", () => {
    const reRead = route.indexOf("await listDueEvidenceDeletions()");
    const staleGuard = route.indexOf(
      "dueEvidenceReviewFingerprint(current) !== review.fingerprint",
    );
    const apply = route.indexOf("return deleteDueEvidence(review.item)");

    expect(reRead).toBeGreaterThan(-1);
    expect(staleGuard).toBeGreaterThan(reRead);
    expect(apply).toBeGreaterThan(staleGuard);
    expect(route).toContain(
      "Evidence deletion eligibility or reviewed details changed. Refresh and review the deletion again.",
    );
  });

  it("freezes and revalidates expired-upload cleanup on the same pattern", () => {
    expect(route).toContain("type ExpiredUploadReview");
    expect(route).toContain("expiredUploadReviewFingerprint");
    expect(route).toContain("fingerprint: expiredUploadReviewFingerprint(item)");

    const reRead = route.indexOf("await listExpiredEvidenceUploads()");
    const staleGuard = route.indexOf(
      "expiredUploadReviewFingerprint(current) !== review.fingerprint",
    );
    const apply = route.indexOf("return cleanExpiredEvidenceUpload(review.item)");

    expect(reRead).toBeGreaterThan(-1);
    expect(staleGuard).toBeGreaterThan(reRead);
    expect(apply).toBeGreaterThan(staleGuard);
    expect(route).toContain(
      "Expired upload eligibility or reviewed details changed. Refresh and review the cleanup again.",
    );
  });

  it("refreshes authoritative lifecycle state after success and rejected or uncertain failure", () => {
    expect(route.match(/await onChanged\(\);/g)?.length).toBeGreaterThanOrEqual(4);
    expect(route.match(/setReview\(null\);/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps the server-side due/expiry descriptor recheck while canonical Tier 4 authority remains unfinished", () => {
    expect(lifecycle).toContain("admin_integrity_evidence_deletion_descriptor");
    expect(lifecycle).toContain("admin_integrity_expired_upload_deletion_descriptor");
    expect(lifecycle).toContain("admin_finalize_integrity_evidence_deletion");
    expect(lifecycle).toContain("admin_discard_expired_evidence_upload");

    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "trust-evidence",
    );
    expect(capability?.migrationStatus).toBe("building");
    expect(["parity", "cutover", "retired"]).not.toContain(capability?.migrationStatus);
  });
});

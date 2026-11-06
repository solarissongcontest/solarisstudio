import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/admin/integrity-evidence.tsx",
  "utf8",
);
const api = readFileSync("src/lib/integrity-evidence.ts", "utf8");
const lifecycle = readFileSync(
  "supabase/functions/integrity-evidence-lifecycle/index.ts",
  "utf8",
);

describe("V3 Organizer evidence deletion confirmation", () => {
  it("does not permanently delete case evidence through window.confirm or a direct action", () => {
    const dueCard = route.slice(
      route.indexOf("function DueEvidenceCard"),
      route.indexOf("function ExpiredUploadCard"),
    );
    expect(dueCard).toContain("AdminConfirmSheet");
    expect(dueCard).toContain("setReview({");
    expect(dueCard).toContain("fingerprint: dueEvidenceReviewFingerprint(item)");
    expect(dueCard).not.toContain("window.confirm");
    expect(dueCard).not.toContain("onClick={() => mutation.mutate()}");
  });

  it("requires typed frozen case confirmation and explains the irreversible consequence", () => {
    expect(route).toContain("This is a Tier 4 irreversible evidence action");
    expect(route).toContain("confirmationText={reviewedItem.case_code}");
    expect(route).toContain("Delete private evidence permanently");
    expect(route).toContain("Scheduled reason:");
    expect(route).toContain("Retention ended:");
    expect(route).toContain("Any stored private file is permanently removed and cannot be recovered from Solaris.");
    expect(route).toContain("The audit record remains.");
  });

  it("revalidates exact scheduled-deletion state before applying the existing lifecycle authority", () => {
    expect(route).toContain("await listDueEvidenceDeletions()");
    expect(route).toContain("dueEvidenceReviewFingerprint(current) !== review.fingerprint");
    expect(route).toContain("return deleteDueEvidence(review.item)");
    expect(route).toContain(
      "Evidence deletion eligibility or reviewed details changed. Refresh and review the deletion again.",
    );
  });

  it("keeps abandoned-upload cleanup separate from case evidence deletion", () => {
    const expiredCard = route.slice(route.indexOf("function ExpiredUploadCard"));
    expect(expiredCard).toContain("return cleanExpiredEvidenceUpload(review.item)");
    expect(expiredCard).toContain("Clean expired upload");
    expect(expiredCard).toContain("expiredUploadReviewFingerprint(current) !== review.fingerprint");
  });

  it("does not misrepresent the current lifecycle edge function as canonical Tier 4 command authority", () => {
    expect(api).toContain('supabase.functions.invoke("integrity-evidence-lifecycle"');
    expect(lifecycle).toContain("service.storage");
    expect(lifecycle).toContain('"admin_finalize_integrity_evidence_deletion"');
    expect(lifecycle).not.toContain("studio2_require_fresh_auth");
    expect(lifecycle).not.toContain("studio2_claim_operation");
  });
});
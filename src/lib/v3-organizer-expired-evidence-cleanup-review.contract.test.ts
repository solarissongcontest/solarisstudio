import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/integrity-evidence.tsx", "utf8");

describe("V3 Organizer expired evidence upload cleanup review", () => {
  it("removes the native browser confirmation path", () => {
    expect(route).not.toContain("window.confirm(");
    expect(route).not.toContain("const confirmCleanup = () =>");
    expect(route).toContain("Review expired upload cleanup");
  });

  it("shows the exact frozen expired upload and irreversible consequence before cleanup", () => {
    expect(route).toContain("data-v3-organizer-expired-upload-cleanup-review");
    expect(route).toContain("Upload token: {reviewedItem.token_id}");
    expect(route).toContain("Private storage object: {reviewedItem.object_exists ?");
    expect(route).toContain("Cleanup discards the upload token permanently");
    expect(route).toContain('"exists and will be permanently removed" : "already absent"');
    expect(route).toContain("The reviewed upload details are frozen while this sheet is open");
  });

  it("requires typed frozen identity confirmation and revalidates before existing cleanup authority", () => {
    expect(route).toContain("confirmationText={reviewedItem.original_name}");
    expect(route).toContain("Type ${reviewedItem.original_name} to confirm cleanup of this exact expired upload.");
    expect(route).toContain("await mutation.mutateAsync();");
    expect(route).toContain("await listExpiredEvidenceUploads()");
    expect(route).toContain("expiredUploadReviewFingerprint(current) !== review.fingerprint");
    expect(route).toContain("return cleanExpiredEvidenceUpload(review.item)");
  });

  it("preserves the stricter scheduled evidence deletion review", () => {
    expect(route).toContain("Review permanent deletion");
    expect(route).toContain("Delete private evidence permanently");
    expect(route).toContain("confirmationText={reviewedItem.case_code}");
    expect(route).toContain("Any stored private file is permanently removed and cannot be recovered from Solaris.");
  });
});
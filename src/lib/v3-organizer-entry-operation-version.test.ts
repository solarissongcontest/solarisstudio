import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isOrganizerEntryReviewResultForDisplayedVersion } from "./v3-organizer-entry-operation-version";

describe("Organizer Entry review operation version presentation", () => {
  it("recognizes a receipt bound to the current immutable Entry version", () => {
    expect(isOrganizerEntryReviewResultForDisplayedVersion("version-4", "version-4")).toBe(true);
  });

  it("treats an operation completed for an earlier version as historical", () => {
    expect(isOrganizerEntryReviewResultForDisplayedVersion("version-3", "version-4")).toBe(false);
    expect(isOrganizerEntryReviewResultForDisplayedVersion("version-3", null)).toBe(false);
    expect(isOrganizerEntryReviewResultForDisplayedVersion(null, "version-4")).toBe(false);
  });

  it("normalizes whitespace without confusing a different version", () => {
    expect(isOrganizerEntryReviewResultForDisplayedVersion(" version-4 ", "version-4")).toBe(true);
    expect(isOrganizerEntryReviewResultForDisplayedVersion("version-4", "version-40")).toBe(false);
  });

  it("supports exact legacy unbound state while retaining server preview/version CAS", () => {
    expect(isOrganizerEntryReviewResultForDisplayedVersion(null, null)).toBe(true);
    expect(isOrganizerEntryReviewResultForDisplayedVersion("", null)).toBe(true);
  });

  it("clears old notes and receipts when a new immutable submission appears", () => {
    const route = readFileSync(resolve(process.cwd(),
      "src/routes/confirmations/admin/responses/$id.tsx"), "utf8");
    expect(route).toContain("setReason(entry.review_reason ?? \"\")");
    expect(route).toContain("setCorrectionNotes({})");
    expect(route).toContain('setCorrectionMessage("")');
    expect(route).toContain("setReceipt(null)");
    expect(route).toContain("entry.current_version_id]");
  });

  it("keeps the previous operation identity for reconciliation while preventing stale success badges", () => {
    const route = readFileSync(resolve(process.cwd(),
      "src/routes/confirmations/admin/responses/$id.tsx"), "utf8");
    expect(route).toContain("expectedEntryVersion: string | null;");
    expect(route).toContain("pending?.expectedEntryVersion");
    expect(route).toContain("displayedEntryVersionRef.current");
    expect(route).toContain("isOrganizerEntryReviewResultForDisplayedVersion");
    expect(route).toContain("Earlier Entry review settled for another version");
    expect(route).toContain("await onChanged()");
    expect(route).toContain("unresolvedReviewOperationRef.current = null");
    expect(route).toContain("isSuccessfulConfirmationEntryReviewReceipt");
    expect(route).toContain('studio2_apply_confirmation_entry_review');
  });
});

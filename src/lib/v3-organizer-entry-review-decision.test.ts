import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  prepareOrganizerEntryReviewDecision,
  isOrganizerEntryReviewDecisionCurrent,
} from "./v3-organizer-entry-review-decision";

const scope = { entryId: "entry-1", submissionId: "submission-1", editionId: "edition-A",
  currentVersionId: "version-4" };

describe("Organizer Entry decision review sheet", () => {
  it("captures exact target and audit reason on review", () => {
    expect(prepareOrganizerEntryReviewDecision(scope, "declined", " Fix metadata ")).toEqual({
      ...scope, status: "declined", reason: "Fix metadata",
    });
  });
  it("allows accepted review without forcing a negative reason", () => {
    expect(prepareOrganizerEntryReviewDecision(scope, "accepted", "").reason).toBe("");
  });
  it("requires reasons for changes, reset and removal", () => {
    for (const status of ["declined", "pending", "removed"] as const) {
      expect(() => prepareOrganizerEntryReviewDecision(scope, status, " ")).toThrow(/reason/);
    }
  });
  it("cannot prepare a decision without exact Organizer edition ownership", () => {
    for (const key of ["entryId", "submissionId", "editionId"] as const) {
      expect(() => prepareOrganizerEntryReviewDecision({ ...scope, [key]: "" }, "accepted", ""))
        .toThrow(/current Entry/);
    }
  });
  it("invalidates pending confirmation after the immutable Entry version changes", () => {
    const intent = prepareOrganizerEntryReviewDecision(scope, "accepted", "");
    expect(isOrganizerEntryReviewDecisionCurrent(intent, { ...scope, currentVersionId: "version-5" }, ""))
      .toBe(false);
  });
  it("invalidates a decision after another submission, edition or entry is selected", () => {
    const intent = prepareOrganizerEntryReviewDecision(scope, "accepted", "");
    for (const key of ["entryId", "submissionId", "editionId"] as const) {
      expect(isOrganizerEntryReviewDecisionCurrent(intent, { ...scope, [key]: "changed" }, ""))
        .toBe(false);
    }
  });
  it("invalidates confirmation when the reason changes after opening it", () => {
    const intent = prepareOrganizerEntryReviewDecision(scope, "declined", "Correct title");
    expect(isOrganizerEntryReviewDecisionCurrent(intent, scope, "Correct artist")).toBe(false);
    expect(isOrganizerEntryReviewDecisionCurrent(intent, scope, " Correct title ")).toBe(true);
  });
  it("binds review buttons to confirmation instead of direct commands", () => {
    const route = readFileSync(resolve(process.cwd(),
      "src/routes/confirmations/admin/responses/$id.tsx"), "utf8");
    expect(route).toContain("prepareOrganizerEntryReviewDecision(");
    expect(route).toContain("isOrganizerEntryReviewDecisionCurrent(");
    expect(route).toContain("pendingReviewDecision");
    expect(route).toContain("onClick={() => requestReviewDecision(\"accepted\")}");
    expect(route).toContain("onClick={() => requestReviewDecision(\"declined\")}");
    expect(route).toContain("onClick={() => requestReviewDecision(\"removed\")}");
    expect(route).not.toContain('onClick={() => void review("accepted")}');
    expect(route).toContain("<AdminConfirmSheet");
    expect(route).toContain("Review current Entry version");
  });
  it("makes authorized Entry cards addressable from the candidate worklist", () => {
    const route = readFileSync(resolve(process.cwd(),
      "src/routes/confirmations/admin/responses/$id.tsx"), "utf8");
    expect(route).toContain('id={`entry-${entry.id}`}');
    expect(route).toContain('const match = /^#entry-([0-9a-f-]{36})$/i.exec(window.location.hash)');
    expect(route).toContain('getElementById(`entry-${match[1]}`)');
    expect(route).toContain('data.id !== id');
  });

  it("keeps the canonical preflight and receipted authority on actual apply", () => {
    const route = readFileSync(resolve(process.cwd(),
      "src/routes/confirmations/admin/responses/$id.tsx"), "utf8");
    expect(route).toContain('"studio2_confirmation_entry_review_preview"');
    expect(route).toContain('"studio2_apply_confirmation_entry_review"');
    expect(route).toContain("unresolvedReviewOperationRef.current");
    expect(route).toContain("await review(pending.status)");
    expect(route).toContain("confirmationText=");
    expect(route).toContain("Boolean(pendingReviewDecision) && open && isScopeCurrent()");
    expect(route).toContain("setPendingReviewDecision(null)");
    expect(route).toContain("if (!pending || busy || !open) return;");
  });
});

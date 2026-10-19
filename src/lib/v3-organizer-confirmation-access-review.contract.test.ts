import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const review = source("src/components/admin/ConfirmationAccessSettingsSheet.tsx");
const route = source("src/routes/confirmations/admin/responses/$id.tsx");

describe("V3 Organizer Confirmation response access review", () => {
  it("removes the direct settings mutation from the response route", () => {
    expect(route).toContain("<ConfirmationAccessSettingsSheet");
    expect(route).not.toContain("async function saveControls()");
    expect(route).not.toContain('"admin_update_confirmation_controls"');
    expect(route).not.toContain("Save settings");
  });

  it("reviews exact before/after control values and derived effective delegation access", () => {
    expect(review).toContain("Effective delegation editing");
    expect(review).toContain("pendingReview?.baseline.editingAllowed");
    expect(review).toContain("pendingReview?.baseline.locked");
    expect(review).toContain("pendingReview?.next.editingAllowed");
    expect(review).toContain("pendingReview?.next.locked");
    expect(review).toContain("reviewedAccessBefore");
    expect(review).toContain("reviewedAccessAfter");
    expect(review).toContain("confirmationText={accessChanges ? country : undefined}");
  });

  it("re-fetches the live response immediately before apply and fails closed on stale settings", () => {
    expect(review).toContain('"admin_confirmation_response"');
    expect(review).toContain("live.editing_allowed !== pendingReview.baseline.editingAllowed");
    expect(review).toContain("live.locked !== pendingReview.baseline.locked");
    expect(review).toContain("liveNotes !== pendingReview.baseline.adminNotes");
    expect(review).toContain("Response settings changed while this review was open");
    expect(review).toContain("Nothing was changed");
  });

  it("keeps one existing mutation authority and does not expose private note contents in the review", () => {
    expect(review.match(/admin_update_confirmation_controls/g)?.length).toBe(1);
    expect(review).toContain("Private organiser notes:");
    expect(review).toContain("Their contents are intentionally not repeated here");
    expect(review).not.toContain("pendingReview.next.adminNotes}</");
    expect(review).not.toContain("pendingReview.baseline.adminNotes}</");
  });

  it("states the remaining legacy authority limitations instead of claiming canonical parity", () => {
    expect(review).toContain("legacy control RPC still does not provide canonical expected-version/CAS");
    expect(review).toContain("idempotency or operation-receipt parity");
    expect(route).toContain("editionLabel={");
    expect(route).toContain('roundName={data.round?.name ?? "Confirmation"}');
    expect(route).toContain("submissionId={data.id}");
  });
});

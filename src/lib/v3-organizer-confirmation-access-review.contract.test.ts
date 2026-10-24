import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const review = source("src/components/admin/ConfirmationAccessSettingsSheet.tsx");
const route = source("src/routes/confirmations/admin/responses/$id.tsx");
const client = source("src/lib/v3-organizer-confirmation-response-access.ts");

describe("V3 Organizer Confirmation response access review", () => {
  it("removes legacy response-settings mutation authority from the Organizer consumer", () => {
    expect(route).toContain("<ConfirmationAccessSettingsSheet");
    expect(route).not.toContain('"admin_update_confirmation_controls"');
    expect(review).not.toContain('"admin_update_confirmation_controls"');
    expect(review).toContain("previewConfirmationResponseAccess");
    expect(review).toContain("applyConfirmationResponseAccessChange");
    expect(client).toContain('"studio2_confirmation_response_access_preview"');
    expect(client).toContain('"studio2_apply_confirmation_response_access_change"');
  });

  it("binds the review to an exact edition, submission and canonical response version", () => {
    expect(route).toContain("editionId={editionId}");
    expect(review).toContain("assertConfirmationResponseAccessScope(preview, editionId, submissionId)");
    expect(review).toContain("pendingReview.preview.expectedVersion");
    expect(review).toContain("livePreview.expectedVersion !== pendingReview.preview.expectedVersion");
    expect(review).toContain("Response settings changed while this review was open");
    expect(client).toContain("reviewedResponseVersion: preview.expectedVersion");
    expect(client).toContain("expectedVersion: preview.expectedVersion");
  });

  it("creates one reviewed operation identity and reconciles uncertain outcomes instead of blind retry", () => {
    expect(review).toContain("createConfirmationResponseAccessCommand");
    expect(review).toContain("pendingReview.command.operationId");
    expect(review).toContain("pendingReview.command.idempotencyKey");
    expect(review).toContain("reconcileOperation({ data: { operationId } })");
    expect(review).toContain("confirmed after reconnecting");
    expect(review).not.toContain("admin_confirmation_response");
  });

  it("reviews exact before/after access state without exposing private note contents", () => {
    expect(review).toContain("pendingReview?.baseline.editingAllowed");
    expect(review).toContain("pendingReview?.baseline.locked");
    expect(review).toContain("pendingReview?.next.editingAllowed");
    expect(review).toContain("pendingReview?.next.locked");
    expect(review).toContain("reviewedAccessBefore");
    expect(review).toContain("reviewedAccessAfter");
    expect(review).toContain("confirmationText={accessChanges ? country : undefined}");
    expect(review).toContain("Their contents are intentionally not repeated here");
    expect(review).not.toContain("pendingReview.next.adminNotes}</");
    expect(review).not.toContain("pendingReview.baseline.adminNotes}</");
  });

  it("fails closed when opening editing would contradict round or edition authority", () => {
    expect(review).toContain("preview.state.roundEditingEnabled");
    expect(review).toContain("preview.state.editionEditingEnabled");
    expect(review).toContain("cannot be opened because the current Confirmation round or edition is not open for editing");
    expect(review).toContain("A response cannot be both editable and locked");
  });
});

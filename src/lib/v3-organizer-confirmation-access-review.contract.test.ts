import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const review = source("src/components/admin/ConfirmationAccessSettingsSheet.tsx");
const route = source("src/routes/confirmations/admin/responses/$id.tsx");
const commands = source("src/integrations/confirmations/response-commands.ts");

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

  it("binds preview, live-state comparison and apply to the shell-owned exact edition", () => {
    expect(review).toContain("useAdminContext()");
    expect(review).toContain("const editionId = organizerEditionId;");
    expect(review).toContain("previewConfirmationResponseAction");
    expect(review).toContain("loadConfirmationResponseForEdition<LiveResponseAccess>");
    expect(review).toContain("scope: { editionId, entityId: submissionId }");
    expect(review).toContain("Response settings changed while this review was open");
    expect(review).toContain("Nothing was changed");
    expect(commands).toContain('"studio2_confirmation_response_access_preview"');
    expect(commands).toContain('"studio2_apply_confirmation_response_access"');
  });

  it("uses expected-version/idempotent authority and reconciles uncertain outcomes", () => {
    expect(review).toContain('command: "confirmation.response.access.update"');
    expect(review).toContain("expectedVersion: preview.expectedVersion");
    expect(review).toContain("idempotencyKey: command.idempotencyKey");
    expect(review).toContain("reconcileOperation");
    expect(review).toContain('reconciliation.receipt.status !== "succeeded"');
    expect(review).not.toContain('"admin_update_confirmation_controls"');
  });

  it("does not expose private note contents in the review confirmation", () => {
    expect(review).toContain("Private organiser notes:");
    expect(review).toContain("Their contents are intentionally not repeated here");
    expect(review).not.toContain("pendingReview.next.adminNotes}</");
    expect(review).not.toContain("pendingReview.baseline.adminNotes}</");
  });
});

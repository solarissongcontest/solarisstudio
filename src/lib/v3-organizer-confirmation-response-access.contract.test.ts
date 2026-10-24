import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const client = source("src/lib/v3-organizer-confirmation-response-access.ts");
const settings = source("src/components/admin/ConfirmationAccessSettingsSheet.tsx");
const recovery = source("src/components/admin/ConfirmationResponseRecoveryControls.tsx");
const route = source("src/routes/confirmations/admin/responses/$id.tsx");

describe("V3 Organizer Confirmation response access consumer", () => {
  it("uses only the governed response-access preview/apply authority for consequential access writes", () => {
    expect(client).toContain('"studio2_confirmation_response_access_preview"');
    expect(client).toContain('"studio2_apply_confirmation_response_access_change"');
    expect(client).toContain('"confirmation.response.access.update"');
    expect(client).toContain('"confirmation.response.recovery.issue"');
    expect(client).toContain('"confirmation.response.recovery.invalidate"');
    expect(client).toContain('"confirmation.response.delete"');

    for (const implementation of [settings, recovery, route]) {
      expect(implementation).not.toContain("admin_update_confirmation_controls");
      expect(implementation).not.toContain("admin_confirmation_create_edit_token");
      expect(implementation).not.toContain("admin_confirmation_revoke_edit_token");
      expect(implementation).not.toContain("admin_confirmation_delete_response");
    }
  });

  it("binds every command to exact edition/submission scope plus expected response version", () => {
    expect(client).toContain("assertConfirmationResponseAccessScope");
    expect(client).toContain("preview.editionId !== editionId");
    expect(client).toContain("preview.submissionId !== submissionId");
    expect(client).toContain("scope: { editionId: preview.editionId, entityId: preview.submissionId }");
    expect(client).toContain("reviewedResponseVersion: preview.expectedVersion");
    expect(client).toContain("p_expected_version: preview.expectedVersion");
  });

  it("reuses the same reviewed operation after an unresolved transport/reconciliation outcome", () => {
    expect(client).toContain("pendingCommandByFingerprint");
    expect(client).toContain("reviewedCommandFingerprint");
    expect(client).toContain("const pending = pendingCommandByFingerprint.get(fingerprint)");
    expect(client).toContain("if (pending) return pending.command");
    expect(client).toContain("rememberPendingCommand(fingerprint");
    expect(client).toContain(
      "const result = parseConfirmationResponseAccessResult(data,",
    );
    expect(client).toContain("\n  forgetPendingCommand(operationId);\n  return result;\n");
    expect(settings).toContain("pendingReview.command.operationId");
    expect(recovery).toContain("reconcile(command.operationId");
  });

  it("rotates operation identity only when reviewed semantics/version change or apply settles", () => {
    expect(client).toContain("expectedVersion: preview.expectedVersion");
    expect(client).toContain("changeKind,");
    expect(client).toContain("reason: reason?.trim() || null");
    expect(client).toContain("canonicalizeCommandValue");
    expect(client).toContain("existing.changeKind === pending.changeKind");
    expect(client).toContain("existingFingerprint !== fingerprint");
  });

  it("keeps recovery secrets non-replayable and forces explicit replacement after uncertain issuance", () => {
    expect(recovery).toContain("secretAvailable");
    expect(recovery).toContain("plaintext secret cannot be replayed after a lost response");
    expect(recovery).toContain("Generate a replacement link");
    expect(recovery).toContain("Solaris stores only the token hash");
    expect(recovery).toContain("reconcile(command.operationId");
  });

  it("requires R3 reauthentication against the same Organizer identity for permanent deletion", () => {
    expect(client).toContain("reauthenticateConfirmationResponseR3");
    expect(client).toContain("auth.getUser()");
    expect(client).toContain("auth.signInWithPassword");
    expect(client).toContain("data.user.id !== originalUserId");
    expect(recovery).toContain("Fresh authentication required");
    expect(recovery).toContain("reconcile(command.operationId");
  });

  it("fails closed when the response has no exact edition context", () => {
    expect(route).toContain("const editionId = data.edition?.id ?? null");
    expect(route).toContain("Response access unavailable");
    expect(route).toContain("not bound to an exact Solaris edition");
    expect(route).toContain("{editionId ? (");
  });
});

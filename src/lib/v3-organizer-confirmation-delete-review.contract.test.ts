import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const route = source("src/routes/confirmations/admin/responses/$id.tsx");
const controls = source("src/components/admin/ConfirmationResponseRecoveryControls.tsx");
const client = source("src/lib/v3-organizer-confirmation-response-access.ts");

describe("V3 Organizer Confirmation permanent deletion review", () => {
  it("removes the legacy destructive RPC from the response route", () => {
    expect(route).toContain("<ConfirmationResponseRecoveryControls");
    expect(route).not.toContain("admin_confirmation_delete_response");
    expect(controls).not.toContain("admin_confirmation_delete_response");
    expect(controls).toContain('changeKind: "delete_response"');
    expect(client).toContain('"confirmation.response.delete"');
  });

  it("requires canonical deletion eligibility and shows dependency evidence", () => {
    expect(controls).toContain("reviewed.delete.allowed");
    expect(controls).toContain("reviewed.delete.dependencies");
    expect(controls).toContain("Deletion blocked by canonical dependencies");
    expect(controls).toContain("Preserve this Confirmation response instead");
    expect(controls).toContain("dependencyCount");
  });

  it("binds the irreversible review to exact context and a reviewed response version", () => {
    expect(controls).toContain("editionLabel");
    expect(controls).toContain("roundName");
    expect(controls).toContain("submittedAt");
    expect(controls).toContain("submissionId");
    expect(controls).toContain("pendingDelete?.preview.expectedVersion");
    expect(controls).toContain("live.expectedVersion !== pendingDelete.preview.expectedVersion");
    expect(controls).toContain('confirmationText={country}');
    expect(controls).toContain("Review permanent deletion");
  });

  it("requires an organizer reason and fresh authentication for R3 commit", () => {
    expect(controls).toContain("Add an organiser reason for this permanent deletion");
    expect(controls).toContain("Fresh authentication required");
    expect(controls).toContain('type="password"');
    expect(controls).toContain("reauthenticateConfirmationResponseR3(deletePassword)");
    expect(client).toContain('riskClass: changeKind === "delete_response" ? "R3" : "R2"');
    expect(client).toContain("signInWithPassword");
    expect(client).toContain("data.user.id !== originalUserId");
  });

  it("keeps one destructive operation identity and reconciles unknown outcomes", () => {
    expect(controls).toContain("commandReason !== reason");
    expect(controls).toContain("command.operationId");
    expect(controls).toContain("command.idempotencyKey");
    expect(controls).toContain("reconcile(command.operationId");
    expect(controls).toContain("rather than retried with a second destructive write");
  });
});

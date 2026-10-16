import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rounds = readFileSync("src/routes/confirmations/admin/rounds.tsx", "utf8");

describe("V3 Organizer Confirmation rounds", () => {
  it("fails closed instead of guessing an active or first edition", () => {
    expect(rounds).toContain("resolveConfirmationRoundEditionId");
    expect(rounds).toContain('title="Select an edition"');
    expect(rounds).toContain('<option value="">Select edition…</option>');
    expect(rounds).toContain("disabled={!editionId || loading}");
    expect(rounds).not.toContain('item.status === "active"');
    expect(rounds).not.toContain("rows[0]");
  });

  it("keeps round mutations on the canonical preview/version/idempotency command path", () => {
    expect(rounds).toContain("previewConfirmationRoundChange");
    expect(rounds).toContain("createOrganisationCommand");
    expect(rounds).toContain("expectedVersion: preview.expectedVersion");
    expect(rounds).toContain("operationId: operation.operationId");
    expect(rounds).toContain("idempotencyKey: operation.idempotencyKey");
    expect(rounds).toContain("applyConfirmationRoundChange");
    expect(rounds).toContain("expectedVersion: pending.preview.expectedVersion");
  });

  it("preserves distinct submission and correction consequences", () => {
    expect(rounds).toContain("No new confirmation requirements were created");
    expect(rounds).toContain("Existing correction access is unchanged");
    expect(rounds).toContain("zero new requirements");
  });
});

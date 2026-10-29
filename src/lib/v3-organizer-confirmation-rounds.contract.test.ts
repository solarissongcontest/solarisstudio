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

  it("rejects stale or contradictory impact reviews across Organizer edition changes", () => {
    expect(rounds).toContain("const organizerEditionRef = useRef(organizerEditionId)");
    expect(rounds).toContain("const previewRequestRef = useRef(0)");
    expect(rounds).toContain("const requestId = ++previewRequestRef.current");
    expect(rounds).toContain("organizerEditionRef.current !== reviewedEditionId");
    expect(rounds).toContain("preview.editionId !== reviewedEditionId");
    expect(rounds).toContain("preview.changeKind !== input.kind");
    expect(rounds).toContain("preview.roundId !== (input.roundId ?? null)");
    expect(rounds).toContain("pending.preview.editionId !== editionId");
    expect(rounds).toContain("organizerEditionRef.current !== pending.preview.editionId");
    expect(rounds).toContain("previewRequestRef.current += 1");
    expect(rounds).toContain("STALE_ROUND_REVIEW_ERROR");
  });

  it("does not let a superseded preview clear the busy state of a newer review", () => {
    expect(rounds).toContain("if (previewRequestRef.current === requestId)");
    expect(rounds).toContain("if (input.roundId) setRoundBusy(null)");
    expect(rounds).toContain("else setBusy(false)");
  });

  it("preserves distinct submission and correction consequences", () => {
    expect(rounds).toContain("No new confirmation requirements were created");
    expect(rounds).toContain("Existing correction access is unchanged");
    expect(rounds).toContain("zero new requirements");
    expect(rounds).toContain("correction-access setting is left unchanged");
    expect(rounds).toContain("It does not open or close new");
    expect(rounds).toContain("submissions.");
  });

  it("reopens an expired round as a fresh submission window instead of immediately closing it again", () => {
    expect(rounds).toContain("willMoveOpeningTimeToNow");
    expect(rounds).toContain("willClearExpiredClosingTime");
    expect(rounds).toContain("The expired closing timestamp will be cleared");
    expect(rounds).toContain("Reopen submissions");
  });

  it("keeps correction controls usable independently from the round open/closed state", () => {
    expect(rounds).toContain("Allow delegation corrections");
    expect(rounds).toContain("Pause delegation corrections");
    expect(rounds).toContain('kind: "editing"');
    expect(rounds).toContain('kind: "status"');
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/results.tsx"),
  "utf8",
);

const service = readFileSync(
  resolve(process.cwd(), "src/lib/studio2-results-operations.ts"),
  "utf8",
);

describe("V3 Organizer Results reviewed-state freshness", () => {
  it("freezes the exact canonical row shown in the review sheet", () => {
    expect(route).toContain("reviewFingerprint: string");
    expect(route).toContain("reviewFingerprint: resultOperationReviewFingerprint(row)");
    expect(route).toContain("showName: row.showName");
    expect(route).toContain("lifecycle: row.lifecycle");
    expect(route).toContain("calculationVersion: row.calculationVersion");
    expect(route).toContain("reviewedVersion: row.reviewedVersion");
    expect(route).toContain("lockedVersion: row.lockedVersion");
    expect(route).toContain("revealReadyVersion: row.revealReadyVersion");
    expect(route).toContain("preconditions: row.preconditions");
  });

  it("re-reads the exact edition-scoped Results snapshot before a first commit", () => {
    expect(route).toContain("if (!sameIdentityRetry)");
    expect(route).toContain("loadStudio2ResultsOperations(operation.editionId)");
    expect(route).toContain("liveRows.find((row) => row.showId === operation.row.showId)");
    expect(route).toContain("availableStudio2ResultActions(liveRow).includes(operation.action)");
    expect(route).toContain("resultOperationReviewFingerprint(liveRow) !== operation.reviewFingerprint");
    expect(route).toContain("Results state changed while this review was open");
    expect(route).toContain("{ status: 409 }");
  });

  it("never silently upgrades a reviewed command to the refreshed row", () => {
    expect(route).toContain("showId: operation.row.showId");
    expect(route).toContain("expectedVersion: operation.row.calculationVersion");
    expect(route).not.toContain("expectedVersion: liveRow.calculationVersion");
    expect(route).not.toContain("showId: liveRow.showId");
  });

  it("preserves same-operation replay after an uncertain response", () => {
    expect(route).toContain("sameIdentityRetry: recovery?.allowSameIdentityRetry === true");
    expect(route).toContain("executionId: operation.executionId");
    expect(route).toContain("recovery?.allowSameIdentityRetry");
    expect(route).toContain("Retry same operation");
    expect(route).not.toContain("executionId: crypto.randomUUID(),\n        expectedVersion");
  });

  it("freezes the semantic audit reason before the first operation attempt", () => {
    expect(route).toContain("commandReason: string | null");
    expect(route).toContain("commandReason: null");
    expect(route).toContain("const commandReason = pending.commandReason ?? reason.trim()");
    expect(route).toContain("const reviewedOperation = pending.commandReason");
    expect(route).toContain("{ ...pending, commandReason }");
    expect(route).toContain("setPending(reviewedOperation)");
    expect(route).toContain("reason: operation.commandReason");
    expect(route).not.toContain("reason,\n        executionId: operation.executionId");
  });

  it("locks the audit reason while the same execution identity can be recovered", () => {
    expect(route).toContain("value={pending.commandReason ?? reason}");
    expect(route).toContain("disabled={mutation.isPending || pending.commandReason !== null}");
    expect(route).toContain("Same-operation recovery reuses this exact reason");
    expect(route).toContain("This retry keeps the original execution identity and exact frozen audit reason");
    expect(route).toContain("Close this review and start a new operation if the reason needs to change");
  });

  it("makes edition scope explicit and freezes edition plus show in the critical review", () => {
    expect(route).toContain("editionLabel as formatEditionLabel");
    expect(route).toContain("const organizerEditionLabel = edition ? formatEditionLabel(edition) : null");
    expect(route).toContain("editionLabel: string");
    expect(route).toContain("editionLabel: organizerEditionLabel");
    expect(route).toContain('data-v3-organizer-context-lock="edition"');
    expect(route).toContain('data-v3-organizer-confirmation-context="edition-show"');
    expect(route).toContain("{pending.editionLabel} · {pending.row.showName}");
  });

  it("keeps consequential mutation and idempotency server-authoritative", () => {
    expect(route).toContain("executeStudio2ResultOperation");
    expect(service).toContain("studio2_execute_result_operation");
    expect(route).not.toContain(".from('results')");
    expect(route).not.toContain('.from("results")');
    expect(route).not.toContain(".from('jury_votes')");
    expect(route).not.toContain(".from('televote_votes')");
  });

  it("tells the operator that drift invalidates the first review", () => {
    expect(route).toContain("Before the first commit, Solaris re-reads this exact edition/show Results snapshot");
    expect(route).toContain("this review is rejected instead of silently applying a different operation");
  });
});
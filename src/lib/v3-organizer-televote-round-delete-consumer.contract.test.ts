import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const component = readFileSync(
  "src/components/televoting/VotingRoundsView.tsx",
  "utf8",
);

describe("Organizer Televote round deletion cutover", () => {
  it("uses the canonical preview/apply deletion boundary", () => {
    expect(component).toContain("previewMergedTelevotingRoundDelete");
    expect(component).toContain("applyMergedTelevotingRoundDelete");
    expect(component).toContain("const preview = await previewDelete({ data: { id: round.id } })");
    expect(component).toContain("expectedGlobalVersion: pending.preview.expectedGlobalVersion");
    expect(component).toContain("expectedRoundVersion: pending.preview.expectedRoundVersion");
    expect(component).not.toContain("deleteMergedTelevotingRound,");
    expect(component).not.toContain("useServerFn(deleteMergedTelevotingRound)");
  });

  it("freezes one operation identity for review and uncertain retry", () => {
    expect(component).toContain("operationId: crypto.randomUUID()");
    expect(component).toContain("idempotencyKey: crypto.randomUUID()");
    expect(component).toContain("stableOperationIdentity: Boolean(pending.operationId)");
    expect(component).toContain("if (recovery.keepOperationOpen)");
    expect(component).toContain("setPendingDelete(pending)");
    expect(component).toContain('confirmLabel={pendingDelete?.attempted ? "Retry same operation"');
  });

  it("shows the reviewed destructive impact instead of a generic warning", () => {
    expect(component).toContain("TelevoteRoundDeleteImpactPreview");
    expect(component).toContain("preview.affected.entries");
    expect(component).toContain("preview.affected.bindings");
    expect(component).toContain("preview.ballotCount");
    expect(component).toContain("preview.resultsStatus");
    expect(component).toContain("preview.calculationVersion");
    expect(component).toContain("preview.expectedGlobalVersion");
    expect(component).toContain("preview.expectedRoundVersion");
  });

  it("fails closed when canonical preflight reports blockers", () => {
    expect(component).toContain("!preview.canDelete || preview.blockers.length");
    expect(component).toContain('preview.blockers.join(" ")');
    expect(component).toContain("Only draft rounds can be deleted.");
  });
});

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/rule-interpretations.tsx", "utf8");
const review = readFileSync(
  "src/components/admin/RuleInterpretationSupersessionReview.tsx",
  "utf8",
);

describe("V3 Organizer Official Interpretation supersession review", () => {
  it("removes the one-click supersession mutation path", () => {
    expect(route).toContain("reviewSupersession");
    expect(route).toContain('onClick={reviewSupersession}');
    expect(route).toContain("Review supersession");
    expect(route).not.toContain('onClick={() => supersedeMutation.mutate()}');
  });

  it("freezes the exact current and replacement interpretation before review", () => {
    expect(route).toContain("type PendingSupersession");
    expect(route).toContain("currentId: selected.id");
    expect(route).toContain("currentCode: selected.code");
    expect(route).toContain("replacementId: replacement.id");
    expect(route).toContain("replacementCode: replacement.code");
    expect(route).toContain("supersedeRuleInterpretation(pending.currentId, pending.replacementId)");
  });

  it("shows both sides of the governance change and requires typed replacement confirmation", () => {
    expect(review).toContain("Becomes historical");
    expect(review).toContain("Becomes replacement");
    expect(review).toContain("confirmationText={replacementCode}");
    expect(review).toContain("Type ${replacementCode} to confirm the replacement");
    expect(review).toContain("System #956");
  });

  it("keeps the existing immutable-publication review intact", () => {
    expect(route).toContain("RuleInterpretationPublicationReview");
    expect(route).toContain("Review publication");
    expect(route).toContain("publishMutation.mutateAsync(selected.id)");
  });
});

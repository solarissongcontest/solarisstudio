import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/admin/rule-interpretations.tsx",
  "utf8",
);
const review = readFileSync(
  "src/components/admin/RuleInterpretationPublicationReview.tsx",
  "utf8",
);
const api = readFileSync("src/lib/rule-interpretations.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260911160400_rule_interpretations.sql",
  "utf8",
);

describe("V3 Organizer Official Interpretation publication review", () => {
  it("does not publish an immutable interpretation directly from the draft editor", () => {
    expect(route).toContain("Review publication");
    expect(route).toContain("setPublishReviewOpen(true)");
    expect(route).toContain("<RuleInterpretationPublicationReview");
    expect(route).not.toContain("onClick={() => publishMutation.mutate(selected.id)}");
  });

  it("shows every public field, cited current rules and effective time before publication", () => {
    expect(review).toContain("Public question");
    expect(review).toContain("Official interpretation");
    expect(review).toContain("Public reasoning");
    expect(review).toContain("Current rules cited");
    expect(review).toContain("getRuleById(ruleId)?.title");
    expect(review).toContain("Effective from:");
  });

  it("makes immutability and the legacy authority boundary explicit", () => {
    expect(review).toContain("immutable");
    expect(review).toContain("System #956");
    expect(review).not.toContain("useMutation");
    expect(review).not.toContain("supabase");
  });

  it("preserves existing draft-only server publication semantics until System #956 replaces them", () => {
    expect(api).toContain('"admin_publish_rule_interpretation"');
    expect(migration).toContain("Only draft interpretations can be published");
    expect(migration).toContain("published_at = now()");
    expect(migration).toContain("published_by = auth.uid()");
  });
});

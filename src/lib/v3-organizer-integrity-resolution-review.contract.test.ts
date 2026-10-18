import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/admin/integrity-resolution.$caseId.tsx",
  "utf8",
);
const review = readFileSync(
  "src/components/admin/IntegrityResolutionDecisionReview.tsx",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260911160000_integrity_sanctions_and_appeals.sql",
  "utf8",
);

describe("V3 Organizer Integrity resolution review", () => {
  it("does not impose a sanction directly from the form", () => {
    expect(route).toContain("setReviewOpen(true)");
    expect(route).toContain("Review Level");
    expect(route).toContain("<IntegritySanctionDecisionReview");
    expect(route).not.toContain('onClick={() => mutation.mutate()} className="admin-action-primary"><Scale');
  });

  it("reviews exact sanction scope, level, target, factors, rationale and visibility", () => {
    expect(review).toContain("Confirmed finding");
    expect(review).toContain("Typical starting level:");
    expect(review).toContain("Target:");
    expect(review).toContain("Aggravating:");
    expect(review).toContain("Mitigating:");
    expect(review).toContain("Decision rationale:");
    expect(review).toContain("reporter-visible");
    expect(review).toContain("action_taken");
  });

  it("does not decide an appeal directly from the fresh-review form", () => {
    expect(route).toContain("setDecisionReviewOpen(true)");
    expect(route).toContain("Review appeal outcome");
    expect(route).toContain("<IntegrityAppealDecisionReview");
    expect(route).not.toContain('onClick={() => decide.mutate()}');
  });

  it("reviews the appealed sanction, grounds, outcome, replacement and fresh-review rationale", () => {
    expect(review).toContain("Appealed sanction");
    expect(review).toContain("Appeal grounds:");
    expect(review).toContain("Outcome:");
    expect(review).toContain("Replacement:");
    expect(review).toContain("Fresh-review rationale:");
    expect(review).toContain("modified on appeal");
    expect(review).toContain("marked overturned");
  });

  it("preserves current server invariants while System #960 owns canonical command authority", () => {
    expect(review).toContain("System #960");
    expect(migration).toContain("A sanction requires a confirmed violation finding");
    expect(migration).toContain("Only the assigned appeal reviewer may decide this appeal");
    expect(migration).toContain("Appeal has already been decided");
    expect(migration).toContain("A reduced appeal outcome must use a lower sanction level");
    expect(migration).toContain("An increased appeal outcome must use a higher sanction level");
  });
});

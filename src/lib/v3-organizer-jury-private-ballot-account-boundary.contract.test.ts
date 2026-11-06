import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/routes/_authenticated/admin/jury/$slug.tsx", "utf8");

describe("Organizer Jury private ballot account/show isolation", () => {
  it("resets prepared correction, DNV and ballot review state when actor or route context changes", () => {
    expect(source).toContain("component: JuryWorkspaceAccountBoundary");
    expect(source).toContain("const actorId = useAuthenticatedUser().id;");
    expect(source).toContain('return <JuryWorkspace key={`${actorId}:${slug}:${show ?? "default"}`} />');
    for (const preparedState of [
      "pendingBallotReview",
      "pendingDnvChange",
      "deleteTarget",
      "editDraft",
    ]) expect(source).toContain(preparedState);
  });

  it("never uses a show-only React Query cache for private Jury review evidence", () => {
    expect(source).toContain('["jury_ballot_statuses", actorId, edition?.id ?? "unscoped", selectedShow?.id ?? "pending"]');
    expect(source).toContain('["jury_ballot_submissions", actorId, edition?.id ?? "unscoped", selectedShow?.id ?? "pending"]');
    expect(source.match(/enabled: Boolean\(actorId && edition\?\.id && selectedShow\?\.id\)/g)?.length).toBe(2);
    for (const option of ["gcTime: 0", "retry: false", "refetchInterval: false", "refetchOnWindowFocus: false", "refetchOnReconnect: false"]) {
      expect(source.split(option).length - 1).toBe(2);
    }
  });

  it("prevents false zero states or high-risk actions while private evidence is missing or revalidating", () => {
    expect(source).toContain("if (privateBallotReadUnavailable) {");
    expect(source).toContain("setPendingBallotReview(null);");
    expect(source).toContain("setPendingDnvChange(null);");
    expect(source).toContain('if (privateBallotReadUnavailable) {\n    return (');
    expect(source).toContain("Retry Jury ballot evidence");
    expect(source).toContain("privateBallotReadError instanceof Error");
    expect(source).toContain("risk_score");
    expect(source).toContain("review_version");
  });

  it("preserves the existing versioned Jury review RPCs and does not alter official scoring authority", () => {
    expect(source).toContain('lifecycleRpc("studio2_jury_dnv_preview"');
    expect(source).toContain('lifecycleRpc("studio2_apply_jury_dnv"');
    expect(source).toContain("p_expected_version");
    expect(source).toContain("idempotencyKey");
    expect(source).toContain("assign_jury_vote");
    expect(source).toContain("clear_jury_point");
  });
});

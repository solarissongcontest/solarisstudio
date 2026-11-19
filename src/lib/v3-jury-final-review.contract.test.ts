import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const juryPage = readFileSync("src/routes/jury-voting.tsx", "utf8");

describe("official jury ballot final review", () => {
  it("never dispatches an official ballot as a preflight success side effect", () => {
    const start = juryPage.indexOf("onSuccess: (nextReport) => {");
    const end = juryPage.indexOf("onError: (caught)", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const preflightSuccess = juryPage.slice(start, end);

    expect(preflightSuccess).toContain('setStage(nextReport.requiresAttestation ? "integrity" : "review")');
    expect(preflightSuccess).not.toContain("submitMutation.mutate(");
  });

  it("shows all official point allocations in the review and declaration stages", () => {
    expect(juryPage).toContain('data-jury-final-review="allocations"');
    expect(juryPage).toContain("round.point_scale.map((points, index)");
    expect(juryPage).toContain("candidate.country_id === targetId");

    const review = juryPage.slice(
      juryPage.indexOf('if (stage === "review" && report)'),
      juryPage.indexOf('if (stage === "integrity" && report)'),
    );
    expect(review).toContain("<JuryBallotReview round={round} selections={selections} />");
    expect(review).toContain("Final submission");
    expect(review).toContain('onClick={() => submitMutation.mutate(report.token)}');

    const declarations = juryPage.slice(
      juryPage.indexOf('if (stage === "integrity" && report)'),
      juryPage.indexOf("function IntegrityEvidence"),
    );
    expect(declarations).toContain("<JuryBallotReview round={round} selections={selections} />");
    expect(declarations).toContain("Sign declaration and submit jury vote");
  });

  it("keeps the governed submission command and authoritative receipt requirement", () => {
    expect(juryPage).toContain("const result = await submitBallot({");
    expect(juryPage).toContain('if (!result.receipt) throw new Error("The jury authority returned no receipt.")');
    expect(juryPage).toContain("reconcileSubmission({");
    expect(juryPage).not.toContain("submit_country_jury_ballot");
  });
});

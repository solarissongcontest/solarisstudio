import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const stage6 = source(".github/scripts/v3-s14-stage-6-jury.sh");
const stage8 = source(".github/scripts/v3-s14-stage-8-results.sh");
const juryResultTruth = source(
  "supabase/migrations/20261003195500_organisation_os_v5_jury_result_truth.sql",
);

describe("S14 Jury review to Results readiness contract", () => {
  it("reviews submitted Jury ballots through governed V5 authority before Stage 8 DNV resolution", () => {
    expect(juryResultTruth).toContain("submission.status = 'valid'");
    expect(stage6).toContain("studio2_jury_ballot_review_preview");
    expect(stage6).toContain("studio2_apply_jury_ballot_review");
    expect(stage6).toContain("currentStatus submitted");
    expect(stage6).toContain("targetStatus valid");
    expect(stage6).toContain("status valid");
    expect(stage6).toContain("S14 Jury reviewed $ordinal submitted ballots instead of 64");
    expect(stage6).toContain("and status='valid';");
    expect(stage6).toContain("and status in ('submitted','needs_review');");
    expect(stage6).not.toContain("update public.jury_ballot_submissions");

    const runStage6 = stage6.slice(stage6.indexOf("run_s14_stage_6_jury()"));
    const closeWindow = runStage6.indexOf(
      'governed_jury_window_change "$ORGANIZER_A_TOKEN" "$SEMI_TWO_ID" closed',
    );
    const validateBallots = runStage6.indexOf("validate_submitted_jury_ballots");
    expect(closeWindow).toBeGreaterThan(-1);
    expect(validateBallots).toBeGreaterThan(-1);
    expect(closeWindow).toBeLessThan(validateBallots);

    expect(stage8).toContain("studio2_jury_dnv_preview");
    expect(stage8).toContain("studio2_apply_jury_dnv");
    expect(stage8).toContain("private.studio2_result_preconditions");
    expect(stage8).toContain("still not calculation-ready after integrity resolution");
  });
});

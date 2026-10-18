import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const driver = readFileSync(".github/scripts/v3-full-contest-rehearsal.sh", "utf8");
const stage8 = readFileSync(".github/scripts/v3-s14-stage-8-results.sh", "utf8");
const finalResults = readFileSync(".github/scripts/v3-s14-grand-final-results.sh", "utf8");
const browser = readFileSync("e2e/v3-s14-grand-final-results-runtime.e2e.ts", "utf8");
const browserConfig = readFileSync("playwright.s14-grand-final-results.config.ts", "utf8");
const resultVersions = readFileSync(
  "supabase/migrations/20261015155722_v3_s3_results_invariants.sql",
  "utf8",
);

describe("S14 Grand Final results preparation", () => {
  it("reviews all 66 submitted final Jury ballots through governed authority", () => {
    expect(finalResults).toContain("studio2_jury_ballot_review_preview");
    expect(finalResults).toContain("studio2_apply_jury_ballot_review");
    expect(finalResults).toContain("66 submitted Jury ballots");
    expect(finalResults).toContain("66 Grand Final Jury ballots are valid");
  });

  it("publishes final Televote truth through the real local app runtime", () => {
    expect(finalResults).toContain("playwright.s14-grand-final-results.config.ts");
    expect(browserConfig).toContain("127.0.0.1:4178");
    expect(browserConfig).not.toContain("supabase.co");
    expect(browser).toContain("S14 Grand Final results browser refuses non-local Supabase URL");
    expect(browser).toContain('/televoting/admin/results');
    expect(browser).toContain("Calculate official result");
    expect(browser).toContain("Lock official result");
    expect(browser).toContain("Check & publish");
    expect(browser).toContain("Publish result");
    expect(finalResults).toContain("round.results.imported");
    expect(finalResults).toContain("frozen_at is not null");
  });

  it("fails closed on the same #651 Televote-to-Studio truth boundary as semifinal Stage 8", () => {
    expect(stage8).toContain("blocked by #651");
    expect(finalResults).toContain("blocked by #651");
    expect(finalResults).toContain("preconditions.televoteReady");
    expect(finalResults).toContain("preconditions.calculationReady");
    expect(finalResults).not.toMatch(/insert\s+into\s+public\.televote_votes/i);
    expect(finalResults).not.toMatch(/update\s+public\.televote_votes/i);
  });

  it("requires immutable v1/v2 reproducibility and exact current-v2 equality before finalization", () => {
    expect(resultVersions).toContain("create table private.v3_result_versions");
    expect(resultVersions).toContain("Result version evidence is immutable");
    expect(finalResults).toContain("immutable_result_snapshot_hash");
    expect(finalResults).toContain("current_result_snapshot_hash");
    expect(finalResults).toContain("final_v1_hash");
    expect(finalResults).toContain("final_v2_hash");
    expect(finalResults).toContain("immutable v1/v2 snapshots differ for identical inputs");
    expect(finalResults).toContain("current result rows do not equal immutable result version 2");
    expect(finalResults).toContain("version in (1,2)");
    expect(finalResults).toContain("did not retain both immutable versions");
  });

  it("uses governed Studio result finalization helpers and binds the final current version to 2", () => {
    expect(finalResults).toContain("execute_result_operation");
    expect(finalResults).toContain("review 2");
    expect(finalResults).toContain("lock 2");
    expect(finalResults).toContain("mark_reveal_ready 2");
    expect(finalResults).toContain("calculationVersion");
    expect(finalResults).toContain("reviewedVersion");
    expect(finalResults).toContain("lockedVersion");
    expect(finalResults).toContain("revealReadyVersion");
    expect(finalResults).toContain("S14_GRAND_FINAL_RESULT_REPRODUCIBLE");
    expect(finalResults).toContain("S14_GRAND_FINAL_RESULTS_COMPLETE");
  });

  it("remains unwired until the stacked semifinal and final-voting prerequisites are real", () => {
    expect(driver).not.toContain('source "$SCRIPT_DIR/v3-s14-grand-final-results.sh"');
    expect(driver).not.toContain("run_s14_grand_final_results");
  });

  it("keeps the Grand Final result shell syntactically valid", () => {
    expect(() =>
      execFileSync("bash", ["-n", ".github/scripts/v3-s14-grand-final-results.sh"], { stdio: "pipe" }),
    ).not.toThrow();
  });
});

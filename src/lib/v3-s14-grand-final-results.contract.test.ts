import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const driver = readFileSync(".github/scripts/v3-full-contest-rehearsal.sh", "utf8");
const finalResults = readFileSync(".github/scripts/v3-s14-grand-final-results.sh", "utf8");
const browser = readFileSync("e2e/v3-s14-grand-final-results-runtime.e2e.ts", "utf8");
const browserConfig = readFileSync("playwright.s14-grand-final-results.config.ts", "utf8");
const resultVersions = readFileSync(
  "supabase/migrations/20261015155722_v3_s3_results_invariants.sql",
  "utf8",
);

describe("S14 Grand Final results", () => {
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
    expect(browser).toContain("/televoting/admin/results");
    expect(browser).toContain("Calculate official result");
    expect(browser).toContain("Lock official result");
    expect(browser).toContain("Check & publish");
    expect(browser).toContain("Publish result");
    expect(finalResults).toContain("round.results.imported");
    expect(finalResults).toContain("frozen_at is not null");
  });

  it("binds Studio output to the exact published Televote version without prescribing System storage", () => {
    expect(finalResults).toContain("assert_s14_final_televote_source_parity");
    expect(finalResults).toContain("televoting.round_results");
    expect(finalResults).toContain("calculation_version=$S14_FINAL_TELEVOTE_SOURCE_VERSION");
    expect(finalResults).toContain("result.televote_points is distinct from source.final_points");
    expect(finalResults).toContain("exact published Televote source version");
    expect(finalResults.match(/assert_s14_final_televote_source_parity/g)?.length ?? 0).toBeGreaterThanOrEqual(5);

    // #896 was closed unmerged. QA certifies the cross-system invariant, not an
    // abandoned intermediate receipt/table design.
    expect(finalResults).not.toContain("studio2_televote_result_imports");
    expect(finalResults).not.toContain("preconditions.televoteSource");
    expect(finalResults).not.toContain("published_import");
  });

  it("fails closed if published Televote source truth does not make Studio calculation ready", () => {
    expect(finalResults).toContain("preconditions.televoteReady");
    expect(finalResults).toContain("preconditions.calculationReady");
    expect(finalResults).toContain("did not satisfy canonical Studio result readiness");
    expect(finalResults).not.toMatch(/insert\s+into\s+public\.televote_votes/i);
    expect(finalResults).not.toMatch(/update\s+public\.televote_votes/i);
  });

  it("adapts the existing Stage 8 result authority instead of requiring phantom helpers", () => {
    expect(finalResults).toContain("execute_result_operation()");
    expect(finalResults).toContain("execute_result_action");
    expect(finalResults).toContain("result_snapshot_value()");
    expect(finalResults).toContain("private.studio2_result_preconditions");
    expect(finalResults).toContain("immutable_result_snapshot_hash()");
    expect(finalResults).toContain("current_result_snapshot_hash()");
    expect(finalResults).toContain("private.v3_result_versions");
    expect(finalResults).not.toContain("Grand Final results require Stage 8 helper");
  });

  it("requires two successive immutable calculations and exact current-version equality before finalization", () => {
    expect(resultVersions).toContain("create table private.v3_result_versions");
    expect(resultVersions).toContain("Result version evidence is immutable");
    expect(finalResults).toContain("immutable_result_snapshot_hash");
    expect(finalResults).toContain("current_result_snapshot_hash");
    expect(finalResults).toContain("final_v1_hash");
    expect(finalResults).toContain("final_v2_hash");
    expect(finalResults).toContain("immutable v1/v2 snapshots differ for identical inputs");
    expect(finalResults).toContain("current result rows do not equal exact immutable recalculation version");
    expect(finalResults).toContain("version in ($FINAL_FIRST_RESULT_VERSION,$FINAL_RESULT_VERSION)");
    expect(finalResults).toContain("did not retain both immutable versions");
  });

  it("uses governed Studio result finalization and binds the exact recalculated final version", () => {
    expect(finalResults).toContain("execute_result_operation");
    expect(finalResults).toContain('review "$FINAL_RESULT_VERSION"');
    expect(finalResults).toContain('lock "$FINAL_RESULT_VERSION"');
    expect(finalResults).toContain('mark_reveal_ready "$FINAL_RESULT_VERSION"');
    expect(finalResults).toContain("calculationVersion");
    expect(finalResults).toContain("reviewedVersion");
    expect(finalResults).toContain("lockedVersion");
    expect(finalResults).toContain("revealReadyVersion");
    expect(finalResults).toContain("S14_GRAND_FINAL_RESULT_REPRODUCIBLE");
    expect(finalResults).toContain("S14_GRAND_FINAL_RESULTS_COMPLETE");
  });

  it("is wired into the stateful contest driver before exact-version Grand Final Publication and Archive", () => {
    expect(driver).toContain('source "$SCRIPT_DIR/v3-s14-grand-final-results.sh"');
    expect(driver).toContain('source "$SCRIPT_DIR/v3-s14-grand-final-publication.sh"');
    expect(driver).toContain(
      "run_contest_extension grand-final-results run_s14_grand_final_results",
    );
    expect(driver).toContain(
      "run_contest_extension grand-final-publication run_s14_grand_final_publication",
    );
    expect(driver).toContain('"grand-final-results",');
    expect(driver).toContain('"grand-final-publication",');
    expect(driver).not.toContain("#651 canonical Televote publication/readiness mismatch");
    expect(driver.indexOf("run_s14_grand_final_results")).toBeLessThan(
      driver.indexOf("run_s14_grand_final_publication"),
    );
    expect(driver.indexOf("run_s14_grand_final_publication")).toBeLessThan(
      driver.lastIndexOf("reconcile_edition_runtime_to_results"),
    );
    expect(driver.lastIndexOf("reconcile_edition_runtime_to_results")).toBeLessThan(
      driver.indexOf("run_stage stage-10-archive run_s14_stage_10_archive"),
    );
    expect(driver).toContain("S14 full persistent contest rehearsal passed through canonical Archive.");
  });

  it("keeps the Grand Final result shell and unified driver syntactically valid", () => {
    expect(() =>
      execFileSync("bash", ["-n", ".github/scripts/v3-s14-grand-final-results.sh"], { stdio: "pipe" }),
    ).not.toThrow();
    expect(() =>
      execFileSync("bash", ["-n", ".github/scripts/v3-full-contest-rehearsal.sh"], { stdio: "pipe" }),
    ).not.toThrow();
  });
});

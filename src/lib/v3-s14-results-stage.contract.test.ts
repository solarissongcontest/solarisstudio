import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { V3_S14_INVARIANTS, V3_S14_STAGES } from "../../scripts/v3-s14-full-contest-spec";

const source = (path: string) => readFileSync(path, "utf8");
const driver = source(".github/scripts/v3-full-contest-rehearsal.sh");
const stage8 = source(".github/scripts/v3-s14-stage-8-results.sh");
const browser = source("e2e/v3-s14-results-runtime.e2e.ts");
const browserConfig = source("playwright.s14-results.config.ts");
const resultSync = source("src/integrations/televoting/results-sync.server.ts");
const resultTruth = source("supabase/migrations/20261003195500_organisation_os_v5_jury_result_truth.sql");
const resultVersions = source("supabase/migrations/20261015155722_v3_s3_results_invariants.sql");

describe("S14 Stage 8 results lifecycle boundary", () => {
  it("prepares the real runtime path without claiming Stage 8 complete while #651 is unresolved", () => {
    expect(V3_S14_STAGES.find((stage) => stage.id === "stage-8-results")?.implementationState).toBe("planned");
    expect(V3_S14_INVARIANTS.find((item) => item.id === "result-reproducible")?.implementationState).toBe("planned");
    expect(driver).not.toContain('source "$SCRIPT_DIR/v3-s14-stage-8-results.sh"');
    expect(driver).not.toContain("run_s14_stage_8_results");
    expect(stage8).toContain("blocked by #651");
    expect(stage8).toContain("preconditions.televoteReady");
    expect(stage8).toContain("preconditions.calculationReady");
  });

  it("reviews submitted Jury ballots and resolves the two intentional missing ballots through governed authority", () => {
    expect(stage8).toContain("studio2_jury_ballot_review_preview");
    expect(stage8).toContain("studio2_apply_jury_ballot_review");
    expect(stage8).toContain("status='valid'");
    expect(stage8).toContain("studio2_jury_dnv_preview");
    expect(stage8).toContain("studio2_apply_jury_dnv");
    expect(stage8).toContain("000000000033");
    expect(stage8).toContain("000000000066");
    expect(stage8).toContain("exactly two DNV records");
  });

  it("publishes both show-bound Televote calculations through the actual app server boundary", () => {
    expect(stage8).toContain("bunx playwright test --config=playwright.s14-results.config.ts");
    expect(browserConfig).toContain("v3-s14-results-runtime.e2e.ts");
    expect(browserConfig).toContain("127.0.0.1:4176");
    expect(browserConfig).not.toContain("supabase.co");
    expect(browser).toContain('/televoting/admin/results');
    expect(browser).toContain('#result-round');
    expect(browser).toContain("Calculate official result");
    expect(browser).toContain("Lock official result");
    expect(browser).toContain("Check & publish");
    expect(browser).toContain("Publish result");
    expect(stage8).toContain("round.results.imported");
    expect(stage8).toContain("frozen_at is not null");
    expect(resultSync).toContain("writeCanonicalShowTelevote");
    expect(resultSync).toContain("televoting_round_bindings");
  });

  it("keeps the discovered cross-system readiness mismatch explicit instead of bypassing it", () => {
    expect(resultTruth).toContain("from public.televote_votes t");
    expect(resultTruth).toContain("v_televote_ready := not v_televote_enabled or v_televote_vote_rows > 0");
    expect(stage8).not.toMatch(/insert\s+into\s+public\.televote_votes/i);
    expect(stage8).not.toMatch(/update\s+public\.televote_votes/i);
    expect(stage8).toContain("Do not bypass this with QA-only table writes");
  });

  it("anchors post-fix reproducibility to immutable S3 result versions before finalization", () => {
    expect(resultVersions).toContain("create table private.v3_result_versions");
    expect(resultVersions).toContain("Result version evidence is immutable");
    expect(stage8).toContain("immutable_result_snapshot_hash");
    expect(stage8).toContain("current_result_snapshot_hash");
    expect(stage8).toContain("version_one_hash");
    expect(stage8).toContain("version_two_hash");
    expect(stage8).toContain("version in (1,2)");
    expect(stage8).toContain("did not retain both immutable versions");
    expect(stage8).toContain("current result rows for $show_id do not equal immutable result version 2");
    expect(stage8).not.toContain("hash_one");
    expect(stage8).not.toContain("hash_two");
  });

  it("contains the governed result-finalization proof without promoting the blocked stage", () => {
    expect(stage8).toContain("studio2_execute_result_operation");
    expect(stage8).toContain("S14 reproducibility recalculation");
    expect(stage8).toContain("mark_reveal_ready");
    expect(stage8).toContain("calculationVersion");
    expect(stage8).toContain("reviewedVersion");
    expect(stage8).toContain("lockedVersion");
    expect(stage8).toContain("revealReadyVersion");
    expect(stage8).toContain("S14_INVARIANT_RESULT_COMPLETE");
    expect(stage8).toContain("S14_STAGE_8_RESULTS_COMPLETE");
  });

  it("keeps the Stage 8 shell syntactically valid", () => {
    expect(() =>
      execFileSync("bash", ["-n", ".github/scripts/v3-s14-stage-8-results.sh"], { stdio: "pipe" }),
    ).not.toThrow();
  });
});

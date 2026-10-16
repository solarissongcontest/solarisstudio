import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { V3_S14_INVARIANTS, V3_S14_STAGES } from "../../scripts/v3-s14-full-contest-spec";

const source = (path: string) => readFileSync(path, "utf8");
const driver = source(".github/scripts/v3-full-contest-rehearsal.sh");
const stage9 = source(".github/scripts/v3-s14-stage-9-publication.sh");
const publication = source("supabase/migrations/20261015164100_v3_s3_publication_invariants.sql");
const resultVersions = source("supabase/migrations/20261015155722_v3_s3_results_invariants.sql");

describe("S14 Stage 9 exact-version publication boundary", () => {
  it("keeps Stage 9 planned until the blocked Stage 8 lifecycle is genuinely complete", () => {
    expect(V3_S14_STAGES.find((stage) => stage.id === "stage-9-publication")?.implementationState).toBe("planned");
    expect(V3_S14_INVARIANTS.find((item) => item.id === "publication-final-version")?.implementationState).toBe("planned");
    expect(driver).not.toContain('source "$SCRIPT_DIR/v3-s14-stage-9-publication.sh"');
    expect(driver).not.toContain("run_s14_stage_9_publication");
  });

  it("publishes outcomes only after exact reviewed, locked and reveal-ready result evidence", () => {
    expect(publication).toContain("v3_publication_result_version_release_ready");
    expect(publication).toContain("source_result_version");
    expect(publication).toContain("reviewed_version = p_version");
    expect(publication).toContain("locked_version = p_version");
    expect(publication).toContain("reveal_ready_version = p_version");
    expect(stage9).toContain("sourceResultVersion 2");
    expect(stage9).toContain("resultReleaseReady true");
    expect(stage9).toContain("riskClass R3");
    expect(stage9).toContain("studio2_apply_show_publication_change");
  });

  it("handles the existing Stage 5 public running-order state without pretending public-to-public is a mutation", () => {
    expect(stage9).toContain("public -> hidden -> public");
    expect(stage9).toContain('apply_publication_change "$show_id" hidden');
    expect(stage9).toContain("s14-hide-before-results");
    expect(stage9).toContain("s14-publish-results");
  });

  it("compares anonymous public result truth row-for-row with immutable result version 2", () => {
    expect(resultVersions).toContain("private.v3_result_versions");
    expect(resultVersions).toContain("result_rows");
    expect(resultVersions).toContain("Result version evidence is immutable");
    expect(stage9).toContain("private.v3_result_versions");
    expect(stage9).toContain("anonymous exact result lookup");
    expect(stage9).toContain("anonymous public result for");
    expect(stage9).toContain("televoteComponents");
    expect(stage9).toContain("finalRank");
  });

  it("proves a public exact-version result cannot silently drift to a later calculation", () => {
    expect(stage9).toContain("S14 stale public result mutation probe");
    expect(stage9).toContain("expect_failure \"post-publication result recalculation");
    expect(stage9).toContain("calculation_version::text");
    expect(stage9).toContain("source_result_version=2");
    expect(stage9).toContain("S14_INVARIANT_PUBLICATION_COMPLETE");
    expect(stage9).toContain("S14_STAGE_9_PUBLICATION_COMPLETE");
  });

  it("keeps the prepared Stage 9 shell syntactically valid", () => {
    expect(() =>
      execFileSync("bash", ["-n", ".github/scripts/v3-s14-stage-9-publication.sh"], { stdio: "pipe" }),
    ).not.toThrow();
  });
});

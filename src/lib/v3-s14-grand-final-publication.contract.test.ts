import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const driver = readFileSync(".github/scripts/v3-full-contest-rehearsal.sh", "utf8");
const stage9 = readFileSync(".github/scripts/v3-s14-stage-9-publication.sh", "utf8");
const finalPublication = readFileSync(".github/scripts/v3-s14-grand-final-publication.sh", "utf8");
const resultVersions = readFileSync(
  "supabase/migrations/20261015155722_v3_s3_results_invariants.sql",
  "utf8",
);

describe("S14 Grand Final exact-version publication", () => {
  it("requires immutable finalized result version 2 before any public outcome release", () => {
    expect(finalPublication).toContain("calculation version 2");
    expect(finalPublication).toContain("reviewed/locked/reveal-ready result version 2");
    expect(finalPublication).toContain("private.v3_result_versions");
    expect(finalPublication).toContain("result_row_count::text");
    expect(finalPublication).toContain("20");
    expect(resultVersions).toContain("create table private.v3_result_versions");
  });

  it("uses the same governed R3 publication authority as Stage 9", () => {
    expect(stage9).toContain("studio2_show_publication_change_preview");
    expect(stage9).toContain("studio2_apply_show_publication_change");
    expect(finalPublication).toContain("publication_preview");
    expect(finalPublication).toContain("sourceResultVersion 2");
    expect(finalPublication).toContain("resultReleaseReady true");
    expect(finalPublication).toContain("integrityClear true");
    expect(finalPublication).toContain("riskClass R3");
    expect(finalPublication).toContain("studio2_operation_receipts");
    expect(finalPublication).toContain("publication.changed");
  });

  it("binds the anonymous public Grand Final exactly to immutable version 2", () => {
    expect(finalPublication).toContain("source_result_version::text");
    expect(finalPublication).toContain("assert_anonymous_result_matches_version \"$FINAL_ID\" 2");
    expect(finalPublication).toContain("publication_config.results");
    expect(finalPublication).toContain("publication_config.jury_results");
    expect(finalPublication).toContain("publication_config.televote_results");
    expect(finalPublication).toContain("publication_config.detailed_voting");
  });

  it("rejects post-publication recalculation so the public pointer cannot silently drift", () => {
    expect(finalPublication).toContain("post-publication Grand Final result recalculation");
    expect(finalPublication).toContain("p_expected_version\":2");
    expect(finalPublication).toContain("failed post-publication mutation moved Grand Final away from public result version 2");
    expect(finalPublication).toContain("failed post-publication mutation moved Grand Final publication pointer");
  });

  it("remains unwired until the full stacked voting/results prerequisites are real", () => {
    expect(driver).not.toContain('source "$SCRIPT_DIR/v3-s14-grand-final-publication.sh"');
    expect(driver).not.toContain("run_s14_grand_final_publication");
    expect(finalPublication).toContain("S14_GRAND_FINAL_PUBLICATION_EXACT_VERSION_COMPLETE");
  });

  it("keeps the Grand Final publication shell syntactically valid", () => {
    expect(() =>
      execFileSync("bash", ["-n", ".github/scripts/v3-s14-grand-final-publication.sh"], { stdio: "pipe" }),
    ).not.toThrow();
  });
});

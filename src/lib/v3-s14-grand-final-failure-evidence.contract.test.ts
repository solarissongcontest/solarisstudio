import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const driver = readFileSync(".github/scripts/v3-full-contest-rehearsal.sh", "utf8");
const workflow = readFileSync(".github/workflows/v3-s14-full-contest-rehearsal.yml", "utf8");

describe("S14 Grand Final failure evidence", () => {
  it("tracks contest extensions as first-class runtime failure stages", () => {
    expect(driver).toContain("COMPLETED_CONTEST_EXTENSIONS=()");
    expect(driver).toContain('CURRENT_STAGE="$extension_id"');
    expect(driver).toContain('COMPLETED_CONTEST_EXTENSIONS+=("$extension_id")');
    expect(driver).toContain('"${COMPLETED_CONTEST_EXTENSIONS[*]}"');
    expect(driver).toContain('"completedContestExtensions": completed_extensions');
  });

  it("runs qualifier preparation, final voting, and canonical results through the tracked extension wrapper", () => {
    expect(driver).toContain(
      "run_contest_extension grand-final-qualifier-bridge prepare_s14_grand_final_from_qualifiers",
    );
    expect(driver).toContain(
      "run_contest_extension grand-final-voting run_s14_grand_final_voting",
    );
    expect(driver).toContain(
      "run_contest_extension grand-final-results run_s14_grand_final_results",
    );
  });

  it("writes successful evidence only after every runtime-tracked canonical phase completed", () => {
    expect(driver).toContain(
      '[[ "${#COMPLETED_STAGES[@]}" == "${#ALL_STAGES[@]}" ]] || fail "release-grade S14 evidence cannot be written with missing lifecycle stages"',
    );
    expect(driver).toContain(
      '[[ "${#COMPLETED_CONTEST_EXTENSIONS[@]}" == "${#ALL_CONTEST_EXTENSIONS[@]}" ]] || fail "release-grade S14 evidence cannot be written with missing contest extensions"',
    );
    expect(driver).toContain(
      '[[ "$(db_scalar "select state from public.studio2_edition_runtime where edition_id=\'$EDITION_ID\'::uuid;")" == "archived" ]] || fail "release-grade S14 evidence requires canonical archived state"',
    );
    expect(driver.indexOf("write_final_evidence")).toBeLessThan(
      driver.lastIndexOf("write_final_evidence"),
    );
    expect(driver.lastIndexOf("write_final_evidence")).toBeGreaterThan(
      driver.indexOf("release-grade S14 evidence cannot be written with missing contest extensions"),
    );
    expect(driver).toContain('"stage-10-archive",');
    expect(driver).toContain('"grand-final-publication",');
    expect(driver).toContain('"pendingStages": []');
    expect(driver).toContain('"pendingContestExtensions": []');
  });

  it("uses the same canonical Grand Final extension vocabulary for success and failure evidence", () => {
    for (const extension of [
      "grand-final-qualifier-bridge",
      "grand-final-voting",
      "grand-final-results",
      "grand-final-publication",
    ]) {
      expect(driver).toContain(extension);
      expect(workflow).toContain(extension);
    }
    expect(driver).not.toContain('"grand-final-jury"');
    expect(driver).not.toContain('"grand-final-televote"');
    expect(workflow).not.toContain('"grand-final-jury"');
    expect(workflow).not.toContain('"grand-final-televote"');
  });

  it("does not preserve the resolved #651 synthetic blocker", () => {
    expect(driver).not.toContain("#651 canonical Televote publication/readiness mismatch");
    expect(driver).toContain('source "$SCRIPT_DIR/v3-s14-grand-final-results.sh"');
  });

  it("keeps the merged stateful driver syntactically valid", () => {
    expect(() =>
      execFileSync("bash", ["-n", ".github/scripts/v3-full-contest-rehearsal.sh"], {
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});

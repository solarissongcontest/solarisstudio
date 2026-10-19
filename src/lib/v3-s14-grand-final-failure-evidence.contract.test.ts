import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const driver = readFileSync(".github/scripts/v3-full-contest-rehearsal.sh", "utf8");

describe("S14 Grand Final failure evidence", () => {
  it("tracks contest extensions as first-class runtime failure stages", () => {
    expect(driver).toContain("COMPLETED_CONTEST_EXTENSIONS=()");
    expect(driver).toContain('CURRENT_STAGE="$extension_id"');
    expect(driver).toContain('COMPLETED_CONTEST_EXTENSIONS+=("$extension_id")');
    expect(driver).toContain('"${COMPLETED_CONTEST_EXTENSIONS[*]}"');
    expect(driver).toContain('"completedContestExtensions": completed_extensions');
  });

  it("runs qualifier preparation and final voting through the tracked extension wrapper", () => {
    expect(driver).toContain(
      "run_contest_extension grand-final-qualifier-bridge prepare_s14_grand_final_from_qualifiers",
    );
    expect(driver).toContain(
      "run_contest_extension grand-final-voting run_s14_grand_final_voting",
    );
  });

  it("keeps Grand Final Results fail-closed behind the canonical System blocker", () => {
    expect(driver).toContain("#651 canonical Televote publication/readiness mismatch");
    expect(driver).not.toContain('source "$SCRIPT_DIR/v3-s14-grand-final-results.sh"');
    expect(driver).toContain('"passed": False');
    expect(driver).toContain('"partial": True');
  });

  it("keeps the merged stateful driver syntactically valid", () => {
    expect(() =>
      execFileSync("bash", ["-n", ".github/scripts/v3-full-contest-rehearsal.sh"], {
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});

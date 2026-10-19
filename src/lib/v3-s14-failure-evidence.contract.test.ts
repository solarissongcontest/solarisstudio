import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const driver = source(".github/scripts/v3-full-contest-rehearsal.sh");
const workflow = source(".github/workflows/v3-s14-full-contest-rehearsal.yml");

describe("S14 exact-SHA runtime failure evidence", () => {
  it("writes fail-closed partial evidence when a lifecycle stage exits non-zero", () => {
    expect(driver).toContain("write_runtime_failure_evidence");
    expect(driver).toContain("trap on_exit EXIT");
    expect(driver).toContain('"runtimeFailure": True');
    expect(driver).toContain('"failureStage": failure_stage');
    expect(driver).toContain('"candidateSha": sha');
    expect(driver).toContain('"passed": False');
    expect(driver).toContain('"partial": True');
    expect(driver).toContain("COMPLETED_STAGES");
    expect(driver).toContain("CURRENT_STAGE");
  });

  it("does not overwrite a successful partial rehearsal with runtime-failure evidence", () => {
    expect(driver).toContain("EVIDENCE_WRITTEN=0");
    expect(driver).toContain('[[ "$EVIDENCE_WRITTEN" != "1" ]]');
    expect(driver).toContain("EVIDENCE_WRITTEN=1");
    expect(driver).toContain('"runtimeFailure": False');
  });

  it("validates and uploads evidence even when the stateful rehearsal itself fails", () => {
    expect(workflow).toContain("id: rehearsal");
    expect(workflow).toContain("Validate exact-SHA rehearsal evidence");
    expect(workflow).toContain("REHEARSAL_OUTCOME: ${{ steps.rehearsal.outcome }}");
    expect(workflow).toContain('if data.get("runtimeFailure") is not True');
    expect(workflow).toContain('if-no-files-found: error');
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const driver = source(".github/scripts/v3-full-contest-rehearsal.sh");
const workflow = source(".github/workflows/v3-s14-full-contest-rehearsal.yml");
const validator = source("scripts/v3-s14-evidence-validator.ts");

describe("S14 exact-SHA runtime failure evidence", () => {
  it("writes fail-closed partial evidence with canonical phase and useful diagnostics", () => {
    expect(driver).toContain("write_runtime_failure_evidence");
    expect(driver).toContain("trap on_exit EXIT");
    expect(driver).toContain('"runtimeFailure": True');
    expect(driver).toContain('"failurePhase": failure_phase');
    expect(driver).toContain('"failureStage": failure_stage');
    expect(driver).toContain('"exitCode": int(exit_code)');
    expect(driver).toContain("canonical_failure_phase");
    expect(driver).toContain('detail.startswith(f"{phase}:")');
    expect(driver).toContain('"candidateSha": sha');
    expect(driver).toContain('"passed": False');
    expect(driver).toContain('"partial": True');
    expect(driver).toContain("COMPLETED_STAGES");
    expect(driver).toContain("CURRENT_STAGE");
  });

  it("tracks pending canonical stages and contest extensions independently", () => {
    expect(driver).toContain("ALL_CONTEST_EXTENSIONS=(");
    expect(driver).toContain("pending_extensions = [extension for extension in all_extensions");
    expect(driver).toContain('"pendingContestExtensions": pending_extensions');
    expect(driver).toContain('"pendingContestExtensions": []');
  });

  it("does not overwrite successful final evidence with runtime-failure evidence", () => {
    expect(driver).toContain("EVIDENCE_WRITTEN=0");
    expect(driver).toContain('[[ "$EVIDENCE_WRITTEN" != "1" ]]');
    expect(driver).toContain("EVIDENCE_WRITTEN=1");
    expect(driver).toContain('"runtimeFailure": False');
  });

  it("delegates lifecycle truth to the semantic validator instead of workflow prose", () => {
    expect(workflow).toContain("scripts/validate-v3-s14-evidence.ts");
    expect(workflow).toContain("--require-complete");
    expect(workflow).not.toContain("expected_pending =");
    expect(workflow).not.toContain("required_invariants = {");
    expect(workflow).not.toContain("Stages 1-9 and Grand Final extensions complete; Archive pending");
    expect(validator).toContain("V3_S14_STAGES");
    expect(validator).toContain("V3_S14_CONTEST_EXTENSIONS");
    expect(validator).toContain("V3_S14_FINAL_LIFECYCLE_STATE");
  });

  it("validates canonical failure phase without discarding useful sub-stage diagnostics", () => {
    expect(validator).toContain("failurePhase");
    expect(validator).toContain("failureStage diagnostics");
    expect(validator).toContain("non-zero exitCode diagnostic");
    expect(validator).toContain("must not manufacture archived completion");
  });

  it("validates and uploads the evidence directory even when rehearsal fails", () => {
    expect(workflow).toContain("id: rehearsal");
    expect(workflow).toContain("Validate exact-SHA S14 evidence");
    expect(workflow).toContain("REHEARSAL_OUTCOME: ${{ steps.rehearsal.outcome }}");
    expect(workflow).toContain("failed S14 did not emit partial/failure evidence");
    expect(workflow).toContain("path: v3-release-evidence/");
    expect(workflow).toContain("if-no-files-found: error");
  });
});

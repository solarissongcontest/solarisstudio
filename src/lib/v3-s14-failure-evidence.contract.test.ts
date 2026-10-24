import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const driver = source(".github/scripts/v3-full-contest-rehearsal.sh");
const browserRuntime = source(".github/scripts/v3-s14-browser-runtime.sh");
const workflow = source(".github/workflows/v3-s14-full-contest-rehearsal.yml");

describe("S14 exact-SHA runtime failure evidence", () => {
  it("writes fail-closed partial evidence with both canonical phase and detailed failure identity", () => {
    expect(driver).toContain("write_runtime_failure_evidence");
    expect(driver).toContain("trap on_exit EXIT");
    expect(driver).toContain('"runtimeFailure": True');
    expect(driver).toContain('"failurePhase": failure_phase');
    expect(driver).toContain('"failureStage": failure_stage');
    expect(driver).toContain("canonical_failure_phase");
    expect(driver).toContain('detail.startswith(f"{phase}:")');
    expect(driver).toContain('"candidateSha": sha');
    expect(driver).toContain('"passed": False');
    expect(driver).toContain('"partial": True');
    expect(driver).toContain("COMPLETED_STAGES");
    expect(driver).toContain("CURRENT_STAGE");
  });

  it("keeps browser bootstrap diagnostics inside the caller's canonical failure phase", () => {
    expect(browserRuntime).toContain('CURRENT_STAGE="${bootstrap_stage}:vite-bootstrap"');
    expect(browserRuntime).toContain('CURRENT_STAGE="${bootstrap_stage}:http-readiness"');
    expect(browserRuntime).toContain('CURRENT_STAGE="${bootstrap_stage}:playwright-bootstrap"');
    expect(browserRuntime).not.toContain('CURRENT_STAGE="vite-bootstrap"');
    expect(browserRuntime).not.toContain('CURRENT_STAGE="http-readiness"');
    expect(browserRuntime).not.toContain('CURRENT_STAGE="playwright-bootstrap"');
  });

  it("tracks pending canonical stages and contest extensions independently", () => {
    expect(driver).toContain("ALL_CONTEST_EXTENSIONS=(");
    expect(driver).toContain("pending_extensions = [extension for extension in all_extensions");
    expect(driver).toContain('"pendingContestExtensions": pending_extensions');
    expect(driver).toContain('"pendingContestExtensions": []');
  });

  it("does not overwrite successful release-grade evidence with runtime-failure evidence", () => {
    expect(driver).toContain("EVIDENCE_WRITTEN=0");
    expect(driver).toContain('[[ "$EVIDENCE_WRITTEN" != "1" ]]');
    expect(driver).toContain("EVIDENCE_WRITTEN=1");
    expect(driver).toContain('"runtimeFailure": False');
  });

  it("validates complete Stage 1-10 plus Grand Final release-grade evidence", () => {
    expect(workflow).toContain('"stage-9-publication",');
    expect(workflow).toContain('"stage-10-archive",');
    expect(workflow).toContain("expected_extensions = [");
    expect(workflow).toContain('"grand-final-publication",');
    expect(workflow).toContain("required_invariants = {");
    expect(workflow).toContain('data.get("completedStages") != expected_stages');
    expect(workflow).toContain('data.get("pendingStages") != []');
    expect(workflow).toContain('data.get("pendingContestExtensions") != []');
    expect(workflow).toContain('data.get("lifecycle", {}).get("finalState") != "archived"');
    expect(workflow).not.toContain("Stages 1-9 and Grand Final extensions complete; Archive pending");
    expect(workflow).not.toContain("Stages 1-7 complete; 8-10 pending");
  });

  it("validates canonical failure phase without discarding useful sub-stage diagnostics", () => {
    expect(workflow).toContain('failure_stage = data.get("failureStage")');
    expect(workflow).toContain('failure_phase = data.get("failurePhase")');
    expect(workflow).toContain('failure_phase == "unknown"');
    expect(workflow).toContain("failed rehearsal emitted unknown canonical failure phase");
    expect(workflow).toContain("failed S14 evidence is missing canonical failure diagnostics");
    expect(workflow).not.toContain('failure_stage not in data.get("pendingStages", [])');
  });

  it("validates and uploads the complete sanitized evidence directory even when rehearsal fails", () => {
    expect(workflow).toContain("id: rehearsal");
    expect(workflow).toContain("Validate exact-SHA S14 evidence");
    expect(workflow).toContain("REHEARSAL_OUTCOME: ${{ steps.rehearsal.outcome }}");
    expect(workflow).toContain(
      'data.get("passed") is not False or data.get("partial") is not True or data.get("runtimeFailure") is not True',
    );
    expect(workflow).toContain("path: v3-release-evidence/");
    expect(workflow).toContain("if-no-files-found: error");
  });
});

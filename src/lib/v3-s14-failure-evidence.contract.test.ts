import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const driver = source(".github/scripts/v3-full-contest-rehearsal.sh");
const workflow = source(".github/workflows/v3-s14-full-contest-rehearsal.yml");

describe("S14 exact-SHA runtime and final evidence", () => {
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

  it("tracks pending canonical stages and contest extensions independently on failure", () => {
    expect(driver).toContain("ALL_CONTEST_EXTENSIONS=(");
    expect(driver).toContain("pending_extensions = [extension for extension in all_extensions");
    expect(driver).toContain('"pendingContestExtensions": pending_extensions');
    expect(driver).toContain('"pendingStages": pending');
  });

  it("writes one final exact-SHA artifact after all ten stages complete", () => {
    expect(driver).toContain("FINAL_PATH=\"$OUTPUT_DIR/s14-full-contest.json\"");
    expect(driver).toContain("run_stage stage-10-archive run_s14_stage_10_archive");
    expect(driver).toContain('"passed": True');
    expect(driver).toContain('"partial": False');
    expect(driver).toContain('"runtimeFailure": False');
    expect(driver).toContain('"pendingStages": []');
    expect(driver).toContain('"supabase-outage"');
    expect(driver).toContain("rm -f \"$PARTIAL_PATH\"");
    expect(driver.indexOf('python3 - "$FINAL_PATH"')).toBeGreaterThan(
      driver.indexOf("run_stage stage-10-archive run_s14_stage_10_archive"),
    );
  });

  it("does not overwrite successful final evidence with runtime-failure evidence", () => {
    expect(driver).toContain("EVIDENCE_WRITTEN=0");
    expect(driver).toContain('[[ "$EVIDENCE_WRITTEN" != "1" ]]');
    expect(driver).toContain("EVIDENCE_WRITTEN=1");
    expect(driver).toContain("rm -f \"$FINAL_PATH\"");
  });

  it("requires complete Stage 1-10 plus Grand Final evidence", () => {
    expect(workflow).toContain('"stage-10-archive",');
    expect(workflow).toContain("expected_extensions = [");
    expect(workflow).toContain('"grand-final-publication",');
    expect(workflow).toContain("required_invariants = {");
    expect(workflow).toContain('"tasks-canonical",');
    expect(workflow).toContain('"notifications-reconcilable",');
    expect(workflow).toContain("required_failures = {");
    expect(workflow).toContain('"supabase-outage",');
    expect(workflow).toContain("Release-grade complete S14 evidence valid for exact SHA");
    expect(workflow).not.toContain('expected_pending = ["stage-10-archive"]');
  });

  it("validates canonical failure phase without discarding useful sub-stage diagnostics", () => {
    expect(workflow).toContain("failure_phase = data.get(\"failurePhase\")");
    expect(workflow).toContain('failure_phase == "unknown"');
    expect(workflow).toContain("failure_phase not in pending_stages and failure_phase not in pending_extensions");
    expect(workflow).not.toContain("failure_stage not in data.get(\"pendingStages\", [])");
  });

  it("enforces local-only destructive rehearsal before stateful execution", () => {
    expect(workflow).toContain("LOCAL_SUPABASE_URL: http://127.0.0.1:54321");
    expect(workflow).toContain("supabase db reset --local --no-seed");
    expect(workflow).toContain('if [[ "$API_URL" != "$LOCAL_SUPABASE_URL" ]]');
    expect(workflow).toContain("check-v3-production-isolation.ts");
    expect(workflow).toContain("SUPABASE_PROJECT_ID=local");
    expect(workflow).not.toContain("supabase.co");
  });

  it("validates and uploads the evidence directory even when rehearsal fails", () => {
    expect(workflow).toContain("id: rehearsal");
    expect(workflow).toContain("Validate exact-SHA rehearsal evidence");
    expect(workflow).toContain("REHEARSAL_OUTCOME: ${{ steps.rehearsal.outcome }}");
    expect(workflow).toContain('if data.get("runtimeFailure") is not True');
    expect(workflow).toContain("path: v3-release-evidence/");
    expect(workflow).toContain("if-no-files-found: error");
  });
});

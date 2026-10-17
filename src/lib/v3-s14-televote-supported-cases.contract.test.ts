import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { V3_S14_INVARIANTS, V3_S14_STAGES } from "../../scripts/v3-s14-full-contest-spec";

const source = (path: string) => readFileSync(path, "utf8");
const stage7 = source(".github/scripts/v3-s14-stage-7-public-voting.sh");
const deadlineStage = source(".github/scripts/v3-s14-stage-7-genuine-deadline.sh");
const driver = source(".github/scripts/v3-full-contest-rehearsal.sh");

describe("S14 canonical Televote Stage 7", () => {
  it("keeps two exact show-bound semi-final rounds with canonical ballot shape", () => {
    expect(stage7).toContain("TV_ROUND_TWO_ID");
    expect(stage7).toContain("$SEMI_ONE_ID");
    expect(stage7).toContain("$SEMI_TWO_ID");
    expect(stage7).toContain("televoting_round_bindings");
    expect(stage7).toContain("source_mode='show'");
    expect(stage7).toContain("total_points_to_distribute=20");
    expect(stage7).not.toContain("total_points_to_distribute=58");
    expect(stage7).toContain("sum(e.points)<>20");
    expect(stage7).toContain("count(*)<>5");
  });

  it("keeps governed open/close authority and durable lifecycle evidence", () => {
    expect(stage7).toContain("studio2_round_status_change_preview");
    expect(stage7).toContain("studio2_apply_round_status_change");
    expect(stage7).toContain("studio2_operation_receipts");
    expect(stage7).toContain("televote.opened");
    expect(stage7).toContain("televote.closed");
    expect(stage7).toContain("private.v3_domain_events");
  });

  it("uses the System-owned persisted deadline contract before each new open", () => {
    expect(deadlineStage).toContain("studio2_round_deadline_change_preview");
    expect(deadlineStage).toContain("studio2_apply_round_deadline_change");
    expect(deadlineStage).toContain("televote.deadline.change");
    expect(deadlineStage).toContain("televote.deadline_set");
    expect(deadlineStage).toContain("s14_stage7_set_deadline_before_open");
    expect(deadlineStage).toContain("apply_televote_round_status_without_deadline");
    expect(deadlineStage).not.toContain("update televoting.rounds set closes_at");
  });

  it("crosses the database deadline while status remains open and performs a genuine +2 minute extension", () => {
    expect(deadlineStage).toContain("clock_timestamp() >= closes_at");
    expect(deadlineStage).toContain("Voting deadline has passed");
    expect(deadlineStage).toContain("closed_at is null");
    expect(deadlineStage).toContain("closes_at + interval '2 minutes'");
    expect(deadlineStage).toContain("== \"120\"");
    expect(deadlineStage).toContain('json_value action)" == "extend"');
    expect(deadlineStage).toContain("televote.extended");
    expect(deadlineStage).toContain("S14_TELEVOTE_DEADLINE_EXTENSION_COMPLETE");
  });

  it("proves replay, stale-version rejection and executable extension consequences", () => {
    expect(deadlineStage).toContain("replay genuine +2 minute Televote extension");
    expect(deadlineStage).toContain("stale competing Televote deadline extension");
    expect(deadlineStage).toContain("changed since this preview");
    expect(deadlineStage).toContain("v3_domain_event_outbox");
    expect(deadlineStage).toContain("televote.tasks");
    expect(deadlineStage).toContain("studio2_claim_domain_event_deliveries");
    expect(deadlineStage).toContain("studio2_process_televote_domain_event");
  });

  it("still proves duplicate protection, uncertainty recovery and integrity evidence", () => {
    expect(stage7).toContain("duplicate public Televote");
    expect(stage7).toContain("v3_create_televote_recovery_handle");
    expect(stage7).toContain("v3_reconcile_televote");
    expect(stage7).toContain("v3_reconcile_televote_recovery");
    expect(stage7).toContain("S14_FAILURE_TELEVOTE_NETWORK_UNCERTAINTY_COMPLETE");
    expect(stage7).toContain("pre_submit_integrity_check");
    expect(stage7).toContain("risk_score=42");
    expect(stage7).toContain("public Televote after round close");
    expect(stage7).toContain("Round is not open");
  });

  it("does not revive close-to-reopen as fake deadline extension evidence", () => {
    expect(deadlineStage).not.toContain("extension-reopen");
    expect(deadlineStage).not.toContain("s14-televote-extension-reopen");
    expect(deadlineStage).not.toContain("Televote after governed extension");
    expect(deadlineStage).not.toContain("opened_at > closed_at");
    expect(deadlineStage).not.toMatch(/apply_televote_round_status[^\n]*closed[\s\S]{0,500}apply_televote_round_status[^\n]*open/);
  });

  it("promotes Stage 7 and its canonical-ballot invariant only with the genuine adapter as evidence", () => {
    const publicVoting = V3_S14_STAGES.find((stage) => stage.id === "stage-7-public-voting");
    const televoteInvariant = V3_S14_INVARIANTS.find((item) => item.id === "televote-canonical-ballot");

    expect(publicVoting?.requirements).toContain("deadline extension");
    expect(publicVoting?.implementationState).toBe("implemented");
    expect(publicVoting?.implementationAsset).toBe(".github/scripts/v3-s14-stage-7-genuine-deadline.sh");
    expect(televoteInvariant?.implementationState).toBe("implemented");
    expect(televoteInvariant?.implementationAsset).toBe(".github/scripts/v3-s14-stage-7-genuine-deadline.sh");
    expect(deadlineStage).toContain('log "S14_STAGE_7_PUBLIC_VOTING_COMPLETE"');
    expect(deadlineStage).toContain('log "S14_INVARIANT_TELEVOTE_COMPLETE"');
  });

  it("binds partial evidence to completed Stage 7 while leaving Results, Publication and Archive pending", () => {
    expect(driver).toContain('source "$SCRIPT_DIR/v3-s14-stage-7-genuine-deadline.sh"');
    expect(driver).toContain("run_s14_stage_7_public_voting");
    expect(driver).toContain('"stage-7-public-voting",');
    expect(driver).toContain('"televote-canonical-ballot",');
    expect(driver).not.toContain('"supportedPendingStageEvidence"');
    expect(driver).toContain("stage-8-results");
    expect(driver).toContain("stage-9-publication");
    expect(driver).toContain("stage-10-archive");
    expect(driver).toContain('"passed": False');
  });

  it("keeps both shell modules syntactically valid", () => {
    expect(() => execFileSync("bash", ["-n", ".github/scripts/v3-s14-stage-7-public-voting.sh"], { stdio: "pipe" })).not.toThrow();
    expect(() => execFileSync("bash", ["-n", ".github/scripts/v3-s14-stage-7-genuine-deadline.sh"], { stdio: "pipe" })).not.toThrow();
  });
});
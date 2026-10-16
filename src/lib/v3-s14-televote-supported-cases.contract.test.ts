import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { V3_S14_INVARIANTS, V3_S14_STAGES } from "../../scripts/v3-s14-full-contest-spec";

const source = (path: string) => readFileSync(path, "utf8");
const stage7 = source(".github/scripts/v3-s14-stage-7-public-voting.sh");
const driver = source(".github/scripts/v3-full-contest-rehearsal.sh");

describe("S14 supported Televote evidence", () => {
  it("uses two exact show-bound semi-final rounds with ballot metadata matching submission authority", () => {
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

  it("uses governed round status authority with durable operation and DomainEvent evidence", () => {
    expect(stage7).toContain("studio2_round_status_change_preview");
    expect(stage7).toContain("studio2_apply_round_status_change");
    expect(stage7).toContain("studio2_operation_receipts");
    expect(stage7).toContain("televote.opened");
    expect(stage7).toContain("televote.closed");
    expect(stage7).toContain("private.v3_domain_events");
  });

  it("exercises both rounds deeply enough to feed later results integration", () => {
    expect(stage7).toContain("accepted $semi_one_accepted ballots instead of 8");
    expect(stage7).toContain("accepted $semi_two_accepted ballots instead of 3");
    expect(stage7).toContain("canonical Televote entry rows are not eleven complete five-entry ballots");
    expect(stage7).toContain("Televote submissions did not bridge to eleven canonical ballot events");
    expect(stage7).toContain("both S14 Televote rounds must be closed before Results");
  });

  it("proves duplicate protection, ambiguity recovery, integrity evidence and closed-window rejection", () => {
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

  it("does not counterfeit the missing deadline-extension contract", () => {
    const publicVoting = V3_S14_STAGES.find((stage) => stage.id === "stage-7-public-voting");
    const televoteInvariant = V3_S14_INVARIANTS.find((item) => item.id === "televote-canonical-ballot");
    expect(publicVoting?.requirements).toContain("deadline extension");
    expect(publicVoting?.implementationState).toBe("planned");
    expect(televoteInvariant?.implementationState).toBe("planned");
    expect(stage7).toContain("S14_STAGE_7_PUBLIC_VOTING_SUPPORTED_CASES");
    expect(stage7).toContain("S14_SUPPORTED_TELEVOTE_CANONICAL_BALLOT");
    expect(stage7).not.toContain('log "S14_STAGE_7_PUBLIC_VOTING_COMPLETE"');
    expect(stage7).not.toContain('log "S14_INVARIANT_TELEVOTE_COMPLETE"');
    expect(stage7).not.toContain("extension-reopen");
    expect(driver).toContain('"supportedPendingStageEvidence": ["stage-7-public-voting"]');
    expect(driver).toContain("stage-7-public-voting");
    expect(driver).not.toContain('"televote-canonical-ballot"');
    expect(driver).toContain('"passed": False');
  });

  it("keeps the shell module syntactically valid", () => {
    expect(() => execFileSync("bash", ["-n", ".github/scripts/v3-s14-stage-7-public-voting.sh"], { stdio: "pipe" })).not.toThrow();
  });
});

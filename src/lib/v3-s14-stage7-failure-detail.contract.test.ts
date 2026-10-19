import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const driver = readFileSync(
  ".github/scripts/v3-full-contest-rehearsal.sh",
  "utf8",
);
const diagnostics = readFileSync(
  ".github/scripts/v3-s14-stage-7-diagnostics.sh",
  "utf8",
);

describe("S14 Stage 7 failure detail evidence", () => {
  it("loads diagnostics after the canonical Public Voting and deadline implementations", () => {
    const publicVoting = driver.indexOf(
      'source "$SCRIPT_DIR/v3-s14-stage-7-public-voting.sh"',
    );
    const deadline = driver.indexOf(
      'source "$SCRIPT_DIR/v3-s14-stage-7-genuine-deadline.sh"',
    );
    const diagnostic = driver.indexOf(
      'source "$SCRIPT_DIR/v3-s14-stage-7-diagnostics.sh"',
    );

    expect(publicVoting).toBeGreaterThanOrEqual(0);
    expect(deadline).toBeGreaterThan(publicVoting);
    expect(diagnostic).toBeGreaterThan(deadline);
  });

  it("wraps Stage 7 boundaries without replacing their canonical implementations", () => {
    for (const originalName of [
      "rpc_request_without_stage7_diagnostics",
      "televote_rpc_request_without_stage7_diagnostics",
      "apply_televote_round_status_without_stage7_diagnostics",
      "s14_stage7_set_deadline_before_open_without_diagnostics",
      "s14_stage7_extend_expired_semi_one_without_diagnostics",
      "submit_supported_vote_without_stage7_diagnostics",
      "run_s14_stage_7_public_voting_supported_cases_without_diagnostics",
    ]) {
      expect(diagnostics).toContain(originalName);
    }
  });

  it("persists useful Public Voting sub-stage identities into CURRENT_STAGE", () => {
    for (const boundary of [
      "rpc:$function_name",
      "televote-rpc:$function_name",
      "round-status:$status:$round_id",
      "deadline-set:$round_id",
      "deadline-extension:$1:$2",
      "ballot:$1:$2",
      "supported-cases",
      "completion-invariants",
    ]) {
      expect(diagnostics).toContain(`s14_stage7_mark \"${boundary}\"`);
    }

    expect(diagnostics).toContain(
      'CURRENT_STAGE="stage-7-public-voting:$1"',
    );
    expect(diagnostics).toContain("S14_STAGE7_DIAGNOSTIC");
  });
});

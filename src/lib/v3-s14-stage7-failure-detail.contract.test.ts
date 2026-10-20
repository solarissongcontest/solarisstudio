import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const driver = readFileSync(
  ".github/scripts/v3-full-contest-rehearsal.sh",
  "utf8",
);
const openDiagnostics = readFileSync(
  ".github/scripts/v3-s14-stage-7-open-diagnostics.sh",
  "utf8",
);
const diagnostics = readFileSync(
  ".github/scripts/v3-s14-stage-7-diagnostics.sh",
  "utf8",
);

describe("S14 Stage 7 failure detail evidence", () => {
  it("loads diagnostics after the canonical Public Voting, deadline and fixture implementations", () => {
    const publicVoting = driver.indexOf(
      'source "$SCRIPT_DIR/v3-s14-stage-7-public-voting.sh"',
    );
    const deadline = driver.indexOf(
      'source "$SCRIPT_DIR/v3-s14-stage-7-genuine-deadline.sh"',
    );
    const fixture = driver.indexOf(
      'source "$SCRIPT_DIR/v3-s14-stage-7-deterministic-fixture.sh"',
    );
    const roundOpenDiagnostic = driver.indexOf(
      'source "$SCRIPT_DIR/v3-s14-stage-7-open-diagnostics.sh"',
    );
    const diagnostic = driver.indexOf(
      'source "$SCRIPT_DIR/v3-s14-stage-7-diagnostics.sh"',
    );

    expect(publicVoting).toBeGreaterThanOrEqual(0);
    expect(deadline).toBeGreaterThan(publicVoting);
    expect(fixture).toBeGreaterThan(deadline);
    expect(roundOpenDiagnostic).toBeGreaterThan(fixture);
    expect(diagnostic).toBeGreaterThan(roundOpenDiagnostic);
  });

  it("records non-secret round-open state without adding another mutation path", () => {
    expect(openDiagnostics).toContain("stage7-round-open-diagnostics.json");
    expect(openDiagnostics).toContain("before-fixture-reset");
    expect(openDiagnostics).toContain("after-fixture-reset");
    expect(openDiagnostics).toContain("studio2_televote_round_versions");
    expect(openDiagnostics).toContain("studio2_televote_global_versions");
    expect(openDiagnostics).toContain("where r.status='open'");
    expect(openDiagnostics).toContain(
      'CURRENT_STAGE="stage-7-public-voting:fixture-reset:$round_id"',
    );
    expect(openDiagnostics).not.toMatch(/https?:\/\//);
    expect(openDiagnostics).not.toContain("supabase.co");
    expect(openDiagnostics).not.toContain("curl ");
    expect(openDiagnostics).not.toContain("rpc_request");
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

    expect(openDiagnostics).toContain(
      "s14_stage7_reset_fixture_lifecycle_before_open_without_open_diagnostics",
    );
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
      expect(diagnostics).toContain(`s14_stage7_mark "${boundary}"`);
    }

    expect(diagnostics).toContain(
      'CURRENT_STAGE="stage-7-public-voting:$1"',
    );
    expect(diagnostics).toContain("S14_STAGE7_DIAGNOSTIC");
  });
});

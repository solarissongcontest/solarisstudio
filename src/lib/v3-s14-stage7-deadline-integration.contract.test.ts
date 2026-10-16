import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const deadlineStage = readFileSync(
  ".github/scripts/v3-s14-stage-7-deadline-extension.sh",
  "utf8",
);
const driver = readFileSync(
  ".github/scripts/v3-full-contest-rehearsal.sh",
  "utf8",
);

describe("S14 Stage 7 canonical Televote deadline integration", () => {
  it("uses the real deadline set and extension authorities", () => {
    expect(deadlineStage).toContain("studio2_round_deadline_set_preview");
    expect(deadlineStage).toContain("studio2_apply_round_deadline_set");
    expect(deadlineStage).toContain("studio2_round_deadline_extension_preview");
    expect(deadlineStage).toContain("studio2_apply_round_deadline_extension");
    expect(deadlineStage).toContain("Voting deadline has passed");
    expect(deadlineStage).toContain("event_type='televote.extended'");
  });

  it("proves extension without synthesizing a close/reopen lifecycle", () => {
    const extensionBody = deadlineStage.slice(
      deadlineStage.indexOf("s14_extend_second_semifinal_and_submit()"),
      deadlineStage.indexOf("submit_supported_vote()", deadlineStage.indexOf("s14_extend_second_semifinal_and_submit()")),
    );
    expect(extensionBody).toContain("status::text from televoting.rounds");
    expect(extensionBody).toContain("opened_at::text");
    expect(extensionBody).toContain("closed_at::text");
    expect(extensionBody).not.toContain("studio2_apply_round_status_change");
    expect(extensionBody).not.toContain("status='closed'");
    expect(extensionBody).not.toContain("status='open'");
  });

  it("replays idempotently and rejects a fresh stale extension", () => {
    expect(deadlineStage).toContain("replay genuine Stage 7 deadline extension");
    expect(deadlineStage).toContain("extension replay advanced the deadline twice");
    expect(deadlineStage).toContain("stale Stage 7 deadline extension");
    expect(deadlineStage).toContain("state changed");
  });

  it("keeps the accepted ballot count stable by extending the third real semifinal ballot", () => {
    expect(deadlineStage).toContain('"s14-semi2-public-03"');
    expect(deadlineStage).toContain("seed_televote_preflight");
    expect(deadlineStage).toContain("ballot during genuinely extended window failed");
    expect(deadlineStage).not.toContain("insert into televoting.vote_submissions");
  });

  it("promotes Stage 7 only after the genuine extension marker is proven", () => {
    expect(deadlineStage).toContain("S14_STAGE7_DEADLINE_EXTENSION_COMPLETE=1");
    expect(deadlineStage).toContain("Stage 7 never exercised the genuine deadline extension path");
    expect(driver).toContain('source "$SCRIPT_DIR/v3-s14-stage-7-deadline-extension.sh"');
    expect(driver).toContain("run_s14_stage_7_public_voting");
    expect(driver).toContain('"stage-7-public-voting"');
    expect(driver).not.toContain("supportedPendingStageEvidence\": [\"stage-7-public-voting\"]");
  });
});

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const driver = readFileSync(".github/scripts/v3-full-contest-rehearsal.sh", "utf8");
const finalLeg = readFileSync(".github/scripts/v3-s14-grand-final-leg.sh", "utf8");
const finalVoting = readFileSync(".github/scripts/v3-s14-grand-final-voting.sh", "utf8");
const jury = readFileSync(".github/scripts/v3-s14-stage-6-jury.sh", "utf8");
const televote = readFileSync(".github/scripts/v3-s14-stage-7-public-voting.sh", "utf8");

describe("S14 Grand Final voting preparation", () => {
  it("depends on the canonical qualifier bridge rather than a pre-seeded final", () => {
    expect(finalVoting).toContain("20 canonical qualified participants");
    expect(finalVoting).toContain("S14_FINAL_TELEVOTE_ROUND_ID");
    expect(finalLeg).toContain("S14_GRAND_FINAL_PREPARED_FROM_CANONICAL_QUALIFIERS");
  });

  it("reuses governed Jury authority for all 66 delegations", () => {
    expect(finalVoting).toContain("governed_jury_window_change");
    expect(jury).toContain("studio2_jury_window_change_preview");
    expect(jury).toContain("studio2_apply_jury_voting_status");
    expect(finalVoting).toContain("seq 1 66");
    expect(finalVoting).toContain("v3_submit_jury_ballot");
    expect(finalVoting).toContain("v3_reconcile_jury_submission");
    expect(finalVoting).toContain("660");
    expect(finalVoting).toContain("own-country Jury vote survived canonical validation");
    expect(finalVoting).not.toMatch(/insert\s+into\s+public\.jury_votes/i);
  });

  it("reuses governed Televote authority and excludes each voter's own country from the generated ballot", () => {
    expect(finalVoting).toContain("entry_key <> '$country_code'");
    expect(finalVoting).toContain("apply_televote_round_status");
    expect(televote).toContain("studio2_round_status_change_preview");
    expect(televote).toContain("studio2_apply_round_status_change");
    expect(finalVoting).toContain("submit_supported_vote");
    expect(finalVoting).toContain("twelve complete five-entry ballots");
    expect(finalVoting).toContain("televote.ballot_submitted");
    expect(finalVoting).not.toMatch(/insert\s+into\s+televoting\.vote_submissions/i);
    expect(finalVoting).not.toMatch(/insert\s+into\s+televoting\.vote_entries/i);
  });

  it("does not falsely wire the Grand Final voting leg before blocked parents are ready", () => {
    expect(driver).not.toContain('source "$SCRIPT_DIR/v3-s14-grand-final-voting.sh"');
    expect(driver).not.toContain("run_s14_grand_final_voting");
    expect(finalVoting).toContain("S14_GRAND_FINAL_VOTING_COMPLETE");
  });

  it("keeps the Grand Final voting shell syntactically valid", () => {
    expect(() =>
      execFileSync("bash", ["-n", ".github/scripts/v3-s14-grand-final-voting.sh"], { stdio: "pipe" }),
    ).not.toThrow();
  });
});

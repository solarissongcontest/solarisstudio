import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adapter = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s14-stage-7-genuine-deadline.sh"),
  "utf8",
);
const foundation = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261017002000_v3_s14_televote_deadline_extension.sql"),
  "utf8",
);
const replayFix = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261017002100_v3_s14_televote_deadline_replay_fix.sql"),
  "utf8",
);

describe("S14 Stage 7 deadline operation identity", () => {
  it("assigns distinct replay-stable identities to both semis and the final, rejecting unknown rounds", () => {
    const identity = adapter.slice(adapter.indexOf("s14_stage7_deadline_set_identity()"), adapter.indexOf("\ns14_stage7_set_deadline_before_open()"));
    const script = `set -euo pipefail
TV_ROUND_ID=semi-one
TV_ROUND_TWO_ID=semi-two
S14_FINAL_TELEVOTE_ROUND_ID=final
fail() { exit 1; }
${identity}
s14_stage7_deadline_set_identity "$1"`;
    const resolve = (round: string) => execFileSync("bash", ["-c", script, "deadline-identity", round], { encoding: "utf8" }).trim();
    const results = ["semi-one", "semi-two", "final"].map(resolve);
    expect(new Set(results.map((value) => value.split("|")[0])).size).toBe(3);
    expect(new Set(results.map((value) => value.split("|")[1])).size).toBe(3);
    expect(resolve("final")).toBe("14000000-0000-4010-8600-000000000001|s14-final-televote-deadline-set");
    expect(resolve("final")).toBe(resolve("final"));
    expect(() => resolve("unknown-round")).toThrow();
  });

  it("tracks the latest System-owned replay-stable command identity", () => {
    expect(foundation).toContain(
      "v_command := case when v_action = 'set' then 'televote.deadline.set' else 'televote.extend' end;",
    );
    expect(replayFix).toContain("'televote.deadline.change'");
    expect(replayFix).toContain("new.command <> 'televote.deadline.change'");
    expect(adapter).toContain('receipt_command" == "televote.deadline.change"');
    expect(adapter).not.toContain('receipt_command" == "televote.deadline.set"');
    expect(adapter).not.toContain('receipt_command" == "televote.extend"');
  });

  it("derives set/extend DomainEvents from the durable result without changing replay identity", () => {
    expect(replayFix).toContain("when new.result ->> 'action' = 'extend' then 'televote.extended'");
    expect(replayFix).toContain("else 'televote.deadline_set'");
    expect(adapter).toContain("event_type='televote.deadline_set'");
    expect(adapter).toContain("event_type='televote.extended'");
  });

  it("keeps receipt identity tied to the same deterministic operations used for replay", () => {
    expect(adapter).toContain("14000000-0000-4007-8500-000000000001");
    expect(adapter).toContain("14000000-0000-4007-8500-000000000002");
    expect(adapter).toContain("s14-televote-semi1-deadline-set");
    expect(adapter).toContain("s14-televote-semi1-deadline-extend-2m");
    expect(adapter).toContain("replay initial Televote deadline");
    expect(adapter).toContain("replay genuine +2 minute Televote extension");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const driver = readFileSync(
  ".github/scripts/v3-full-contest-rehearsal.sh",
  "utf8",
);
const fixture = readFileSync(
  ".github/scripts/v3-s14-stage-7-deterministic-fixture.sh",
  "utf8",
);

function sourceIndex(file: string) {
  const marker = `source \"$SCRIPT_DIR/${file}\"`;
  const index = driver.indexOf(marker);
  expect(index, `${file} must be sourced by the full-contest driver`).toBeGreaterThan(-1);
  return index;
}

describe("S14 Stage 7 deterministic fixture baseline", () => {
  it("runs after the governed deadline adapter and before diagnostics", () => {
    const deadline = sourceIndex("v3-s14-stage-7-genuine-deadline.sh");
    const baseline = sourceIndex("v3-s14-stage-7-deterministic-fixture.sh");
    const diagnostics = sourceIndex("v3-s14-stage-7-diagnostics.sh");

    expect(deadline).toBeLessThan(baseline);
    expect(baseline).toBeLessThan(diagnostics);
  });

  it("resets only synthetic semifinal round lifecycle timestamps before open", () => {
    expect(fixture).toContain("s14_stage7_is_semifinal_fixture_round");
    expect(fixture).toContain('[[ "$round_id" == "$TV_ROUND_ID" ]]');
    expect(fixture).toContain('"${TV_ROUND_TWO_ID:-}"');
    expect(fixture).toContain("opens_at=null");
    expect(fixture).toContain("closes_at=null");
    expect(fixture).toContain("closed_at=null");
    expect(fixture).toContain("status='draft'");
  });

  it("resets before delegating to the captured governed-deadline operation", () => {
    const resetCall = fixture.indexOf(
      's14_stage7_reset_fixture_lifecycle_before_open "$round_id"',
    );
    const governedCall = fixture.indexOf(
      'apply_televote_round_status_with_governed_deadline "$@"',
    );

    expect(resetCall).toBeGreaterThan(-1);
    expect(governedCall).toBeGreaterThan(resetCall);
    expect(fixture).toContain(
      "eval \"$(declare -f apply_televote_round_status | sed '1s/apply_televote_round_status/apply_televote_round_status_with_governed_deadline/')\"",
    );
  });

  it("does not add hosted endpoints or a second HTTP/RPC mutation path", () => {
    expect(fixture).not.toMatch(/https?:\/\//);
    expect(fixture).not.toContain("supabase.co");
    expect(fixture).not.toContain("curl ");
    expect(fixture).not.toContain("rpc_request");
    expect(fixture).not.toContain("televote_rpc_request");
  });
});

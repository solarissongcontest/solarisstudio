import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adapter = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s14-stage-7-genuine-deadline.sh"),
  "utf8",
);
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261017002000_v3_s14_televote_deadline_extension.sql"),
  "utf8",
);

describe("S14 Stage 7 deadline operation identity", () => {
  it("tracks the System-owned split semantic command identities", () => {
    expect(migration).toContain(
      "v_command := case when v_action = 'set' then 'televote.deadline.set' else 'televote.extend' end;",
    );
    expect(adapter).toContain('receipt_command" == "televote.deadline.set"');
    expect(adapter).toContain('receipt_command" == "televote.extend"');
    expect(adapter).not.toContain('== "televote.deadline.change"');
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

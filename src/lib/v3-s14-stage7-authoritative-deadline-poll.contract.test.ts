import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adapter = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s14-stage-7-genuine-deadline.sh"),
  "utf8",
);

describe("S14 Stage 7 authoritative deadline expiry", () => {
  it("uses one database-clock snapshot and an explicit expiry state instead of PostgreSQL boolean text abbreviations", () => {
    // PostgreSQL's bool::text is 'true'/'false', not the psql bool output 't'/'f'.
    // Comparing a cast boolean with 't' made the original expiry poll impossible
    // to satisfy, even after the real server-authoritative deadline passed.
    expect(adapter).not.toContain("select (clock_timestamp() >= closes_at)::text");
    expect(adapter).toContain("with sample as (select clock_timestamp() as db_now)");
    expect(adapter).toMatch(
      /case when r\.closes_at is not null and sample\.db_now >= r\.closes_at then 'expired' else 'waiting' end/,
    );
    expect(adapter).toContain('if [[ "$expiry_state" == "expired" ]]; then');
  });

  it("fails closed with the authoritative deadline and database time when the expiry is not observed", () => {
    expect(adapter).toContain('[[ "$expired" == "1" ]] || fail');
    expect(adapter).toContain("S14_STAGE7_DEADLINE_POLL");
    expect(adapter).toContain("seconds_remaining=$seconds_remaining");
    expect(adapter).toContain("db_now=$db_now");
    expect(adapter).toContain("closes_at=$persisted_deadline");
    expect(adapter).toContain("S14 Televote fixture never crossed the authoritative server deadline");
  });

  it("proves that deadline expiry rejects ballots without fabricating a lifecycle close", () => {
    expect(adapter).toContain('== "open" ]] || fail "deadline expiry incorrectly closed');
    expect(adapter).toContain('expect_failure "public Televote after authoritative deadline"');
    expect(adapter).toContain("Voting deadline has passed");
    expect(adapter).toContain("expired ballot created canonical submission state");
    expect(adapter).toContain("replay genuine +2 minute Televote extension");
  });
});

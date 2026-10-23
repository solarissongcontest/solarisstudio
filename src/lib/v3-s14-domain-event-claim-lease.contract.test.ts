import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stage8 = readFileSync(".github/scripts/v3-s14-stage-8-results.sh", "utf8");
const outboxMigration = readFileSync(
  "supabase/migrations/20261015180000_v3_s4_domain_event_outbox.sql",
  "utf8",
);

describe("S14 Results worker-crash DomainEvent lease contract", () => {
  it("uses a canonical valid lease and waits for real expiry before reclaim", () => {
    expect(outboxMigration).toContain("p_lease_seconds not between 5 and 3600");
    expect(stage8).toContain("local crash_lease_seconds=5 recovery_lease_seconds=60");
    expect(stage8).toContain("100,$crash_lease_seconds");
    expect(stage8).toContain("sleep $((crash_lease_seconds + 1))");
    expect(stage8).toContain("100,$recovery_lease_seconds");
    expect(stage8).not.toContain("100,1");
  });
});

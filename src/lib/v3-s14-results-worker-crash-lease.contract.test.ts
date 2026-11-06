import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stage8 = readFileSync(".github/scripts/v3-s14-stage-8-results.sh", "utf8");
const outboxMigration = readFileSync(
  "supabase/migrations/20261015180000_v3_s4_domain_event_outbox.sql",
  "utf8",
);

describe("S14 Results worker-crash lease rehearsal", () => {
  it("uses a lease accepted by the canonical outbox contract and waits for genuine expiry", () => {
    expect(outboxMigration).toContain("p_lease_seconds not between 5 and 3600");
    expect(stage8).toContain(
      "studio2_claim_domain_event_deliveries('results.tasks','s14-crash-worker',100,5)",
    );
    expect(stage8).not.toContain(
      "studio2_claim_domain_event_deliveries('results.tasks','s14-crash-worker',100,1)",
    );
    expect(stage8).toContain("sleep 6");
    expect(stage8).toContain("S14_FAILURE_WORKER_CRASH_COMPLETE");
  });
});

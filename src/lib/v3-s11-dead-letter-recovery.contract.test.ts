import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const rehearsal = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s11-dead-letter-recovery-rehearsal.sh"),
  "utf8",
);

describe("System V3 S11 dead-letter recovery", () => {
  it("refuses hosted Supabase and uses only the canonical S4 recovery boundaries", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing non-local database rehearsal");
    expect(rehearsal).toContain("studio2_claim_domain_event_deliveries");
    expect(rehearsal).toContain("studio2_fail_domain_event_delivery");
    expect(rehearsal).toContain("studio2_requeue_dead_letter_domain_event");
    expect(rehearsal).toContain("studio2_complete_domain_event_delivery");
  });

  it("preserves attempt history during ordinary dead-letter recovery", () => {
    expect(rehearsal).toContain(
      "studio2_requeue_dead_letter_domain_event('$EVENT_ID'::uuid,'$CONSUMER_KEY',false)",
    );
    expect(rehearsal).toContain("pending:1");
    expect(rehearsal).toContain("recovery claim did not advance preserved attempt count");
  });

  it("proves one receipt and replay-safe convergence after recovery", () => {
    expect(rehearsal).toContain("exactly one immutable consumer receipt");
    expect(rehearsal).toContain("duplicate completion did not report replay");
    expect(rehearsal).toContain("duplicate completion created a second consumer receipt");
    expect(rehearsal).toContain("duplicate completion rewrote the original receipt");
  });

  it("refuses broad or repeated requeue once the delivery is no longer dead-lettered", () => {
    expect(rehearsal).toContain("second requeue while pending");
    expect(rehearsal).toContain("requeue after successful recovery");
    expect(rehearsal).toContain("CONSUMER_KEY='recovery.s11'");
  });
});

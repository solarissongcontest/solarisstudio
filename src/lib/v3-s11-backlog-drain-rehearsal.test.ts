import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { V3_FAILURE_INJECTION_COVERAGE } from "./v3-failure-injection-coverage";

const rehearsal = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s11-backlog-drain-rehearsal.sh"),
  "utf8",
);

describe("System V3 S11 bounded backlog-drain rehearsal", () => {
  it("requires explicit evidence-backed load shape and exact checkout identity", () => {
    for (const name of [
      "V3_S11_BACKLOG_EVENTS",
      "V3_S11_DRAIN_BATCH",
      "V3_S11_READ_REQUESTS",
      "V3_S11_BACKLOG_SHA",
      "V3_S11_BACKLOG_LOAD_SOURCE",
      "V3_S11_BACKLOG_LOAD_RATIONALE",
    ]) {
      expect(rehearsal).toContain(name);
    }
    expect(rehearsal).toContain("git rev-parse HEAD");
    expect(rehearsal).toContain("does not match checked-out commit");
    expect(rehearsal).toContain("must be <= 100 because the canonical S4 claim contract is bounded to 100");
  });

  it("hard-refuses hosted targets and unrelated actionable jury backlog", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing hosted/non-local database rehearsal");
    expect(rehearsal).toContain("already has $PREEXISTING_ACTIONABLE actionable jury.tasks deliveries");
    expect(rehearsal).toContain("local isolation invariant violated");
  });

  it("generates backlog through real governed Jury R2 operations instead of direct outbox mutation", () => {
    expect(rehearsal).toContain("studio2_apply_jury_voting_status");
    expect(rehearsal).toContain('"p_status": "closed"');
    expect(rehearsal).toContain("event_row.event_type='jury.closed'");
    expect(rehearsal).not.toContain("insert into private.v3_domain_event_outbox");
    expect(rehearsal).not.toContain("update private.v3_domain_event_outbox");
  });

  it("drains only through canonical bounded S4 claim and Jury consumer contracts", () => {
    expect(rehearsal).toContain("studio2_claim_domain_event_deliveries(");
    expect(rehearsal).toContain("studio2_process_jury_domain_event(");
    expect(rehearsal).toContain("claim exceeded requested bounded batch size");
    expect(rehearsal).toContain("fixture backlog did not drain to zero");
    expect(rehearsal).toContain("immutable consumer receipts");
    expect(rehearsal).toContain("dead-letter fixture deliveries");
    expect(rehearsal).toContain("unexpectedly retried");
  });

  it("measures ordinary read latency concurrently without inventing thresholds", () => {
    expect(rehearsal).toContain("sample_reads &");
    expect(rehearsal).toContain("ordinary read sampling observed");
    expect(rehearsal).toContain("eventsPerSecond");
    expect(rehearsal).toContain("'p50'");
    expect(rehearsal).toContain("'p95'");
    expect(rehearsal).toContain("'p99'");
    expect(rehearsal).toContain("'thresholds':None");
    expect(rehearsal).toContain("'certificationClaim':False");
  });

  it("preserves immutable ledgers and marks backlog evidence rehearsal-ready, not rehearsed", () => {
    expect(rehearsal).toContain("Fixture ledger rows are intentionally left in this disposable local database");
    expect(rehearsal).not.toContain("delete from private.v3_domain_events");
    expect(rehearsal).not.toContain("delete from private.v3_domain_event_consumer_receipts");
    expect(
      V3_FAILURE_INJECTION_COVERAGE.find((entry) => entry.scenario === "queue_backlog")?.state,
    ).toBe("rehearsal_ready");
  });
});

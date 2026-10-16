import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261016064000_v3_s9_operation_trace.sql"),
  "utf8",
);
const rehearsal = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s9-operation-trace-rehearsal.sh"),
  "utf8",
);
const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/v3-s9-operation-trace-rehearsal.yml"),
  "utf8",
);

describe("System V3 S9 operation trace", () => {
  it("requires global system.read and an exact operation id", () => {
    expect(migration).toContain("studio2_access_allowed('system.read', null, false)");
    expect(migration).toContain("Operation id is required");
    expect(migration).toContain("Operation not found");
    expect(migration).toContain("where receipt.operation_id = p_operation_id");
  });

  it("correlates operation, DomainEvent and consumer lifecycle fields", () => {
    expect(migration).toContain("'correlationId', v_operation.correlation_id");
    expect(migration).toContain("from private.v3_domain_events event_row");
    expect(migration).toContain("from private.v3_domain_event_outbox delivery");
    expect(migration).toContain("private.v3_domain_event_consumer_receipts consumer_receipt");
    expect(migration).toContain("'attemptCount', delivery.attempt_count");
    expect(migration).toContain("'deadLetteredAt', delivery.dead_lettered_at");
  });

  it("does not project semantic/event/error payload bodies", () => {
    expect(migration).not.toContain("event_row.payload");
    expect(migration).not.toContain("v_operation.result");
    expect(migration).not.toContain("request_fingerprint");
    expect(migration).not.toContain("last_error_metadata");
    expect(migration).not.toContain("result_metadata");
  });

  it("keeps browser access protected and rehearses on isolated local Supabase", () => {
    expect(migration).toContain("from public, anon;");
    expect(migration).toContain("to authenticated, service_role;");
    expect(rehearsal).toContain("anonymous operation trace");
    expect(rehearsal).toContain("ordinary user operation trace");
    expect(rehearsal).toContain("S9_PRIVATE_PAYLOAD_MUST_NOT_LEAK");
    expect(workflow).toContain("supabase db reset --local --no-seed");
    expect(workflow).toContain("supabase migration up --local --include-all");
    expect(workflow).not.toMatch(/supabase\.co/i);
  });
});

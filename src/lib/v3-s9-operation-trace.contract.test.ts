import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261016064000_v3_s9_operation_trace.sql"),
  "utf8",
);
const integrityMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261104013000_v3_s9_operation_trace_integrity.sql"),
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

  it("surfaces canonical correlation and delivery-receipt inconsistencies without leaking payloads", () => {
    expect(integrityMigration).toContain("v3_register_migration_contract(");
    expect(integrityMigration).toContain("'v3.s9.operation-trace-receipt-integrity'");
    expect(integrityMigration).toContain("'forward_fix_only'");
    expect(integrityMigration).toContain("create or replace function public.admin_system_operation_trace(");
    expect(integrityMigration).toContain("'schemaVersion', 2");
    expect(integrityMigration).toContain("'eventCorrelationId', event_row.correlation_id");
    expect(integrityMigration).toContain("'correlationMatchesOperation', event_row.correlation_id = v_operation.correlation_id");
    expect(integrityMigration).toContain("'eventCorrelationMismatches'");
    expect(integrityMigration).toContain("event_row.correlation_id is distinct from v_operation.correlation_id");
    expect(integrityMigration).toContain("'receiptState', case");
    expect(integrityMigration).toContain("'completedDeliveriesMissingReceipts'");
    expect(integrityMigration).toContain("'noncompletedDeliveriesWithReceipts'");
    expect(integrityMigration).toContain("'orphanConsumerKeys'");
    expect(integrityMigration).toContain("'orphanConsumerReceipts'");
    expect(integrityMigration).toContain("delivery.event_id is null");
    expect(integrityMigration).toContain("consumer_receipt.consumer_key = delivery.consumer_key");
    expect(integrityMigration).toContain("studio2_access_allowed('system.read', null, false)");
    expect(integrityMigration).not.toContain("event_row.payload");
    expect(integrityMigration).not.toContain("v_operation.result");
    expect(integrityMigration).not.toContain("last_error_metadata");
    expect(integrityMigration).not.toContain("result_metadata");
    expect(rehearsal).toContain("missing_completed_receipt");
    expect(rehearsal).toContain("unexpected_noncompleted_receipt");
    expect(rehearsal).toContain("trace.orphan-receipt");
    expect(rehearsal).toContain("eventCorrelationMismatches");
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

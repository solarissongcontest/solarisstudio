import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261016053000_v3_s5_results_consequences.sql",
);
const rehearsal = source(
  ".github/scripts/v3-s5-results-consequences-rehearsal.sh",
);
const registry = source("src/lib/v3-domain-consequence-registry.ts");

describe("System V3 S5 Results consequences", () => {
  it("bridges the existing idempotent execution ledger instead of rewriting result calculation", () => {
    expect(migration).toContain("on public.studio2_result_operation_executions");
    expect(migration).toContain("new.execution_id");
    expect(migration).not.toContain("recalculate_show_results_internal");
    expect(migration).not.toContain("materialize_show_results_if_missing");
    expect(migration).not.toContain("update public.results");
  });

  it("maps only completed canonical facts to the declared System event vocabulary", () => {
    expect(migration).toContain("new.action = 'calculate'");
    expect(migration).toContain("'results.calculated'");
    expect(migration).toContain("new.action = 'review'");
    expect(migration).toContain("'results.verified'");
    expect(migration).toContain("new.action = 'lock'");
    expect(migration).toContain("'results.locked'");
    expect(migration).toContain("else\n    return new;");
    expect(migration).not.toContain("'results.unlocked'");
  });

  it("binds the event to the exact canonical calculation version and show scope", () => {
    expect(migration).toContain("operation.show_id = new.show_id");
    expect(migration).toContain("operation.edition_id = new.edition_id");
    expect(migration).toContain("operation.calculation_version = new.calculation_version");
    expect(migration).toContain("new.show_id::text");
    expect(migration).toContain("new.calculation_version");
  });

  it("uses the execution UUID as durable operation/correlation identity", () => {
    expect(migration).toContain("new.execution_id::text");
    expect(migration).toContain("private.studio2_request_fingerprint");
    expect(migration).toContain("v_operation.correlation_id is distinct from new.execution_id");
    expect(migration).toContain("v_operation.status <> 'succeeded'");
  });

  it("does not place reasons or result rows into DomainEvent payloads", () => {
    expect(migration).toContain("'executionId', new.execution_id");
    expect(migration).toContain("'calculationVersion', new.calculation_version");
    expect(migration).not.toContain("'reason', new.reason");
    expect(migration).not.toContain("jsonb_agg");
  });

  it("reconciles organizer task consequences through the shared leased consumer contract", () => {
    expect(migration).toContain("array['results.tasks']::text[]");
    expect(migration).toContain("private.v3_domain_event_consumer_receipts");
    expect(migration).toContain("v_delivery.lease_owner is distinct from p_worker_id");
    expect(migration).toContain("private.studio2_reconcile_all_organizer_tasks");
    expect(migration).toContain("private.studio2_sync_task_notifications");
    expect(migration).toContain("private.studio2_request_is_service_role()");
  });

  it("ships a hostile local-only rehearsal for collision, replay and role boundaries", () => {
    expect(rehearsal).toContain('case "$API_URL" in http://127.0.0.1:*|http://localhost:*');
    expect(rehearsal).toContain('case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*');
    expect(rehearsal).toContain("count(distinct event_type)");
    expect(rehearsal).toContain("results-task-reconciliation");
    expect(rehearsal).toContain("replay-worker");
    expect(rehearsal).toContain("anonymous Results consequence processing unexpectedly succeeded");
    expect(rehearsal).toContain("unlock was falsely bridged");
  });

  it("records event-backed evidence for all declared Results facts", () => {
    expect(registry).toContain('"results.calculated": [');
    expect(registry).toContain('"results.verified": [');
    expect(registry).toContain('"results.locked": [');
    expect(registry).toContain(
      '"supabase/migrations/20261016053000_v3_s5_results_consequences.sql"',
    );
  });
});

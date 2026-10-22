import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261021024000_v3_s9_s10_observability_authority_fixes.sql",
  ),
  "utf8",
);

function functionBody(signature: string, delimiter: string) {
  const start = migration.indexOf(`create or replace function ${signature}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = migration.indexOf(`as $${delimiter}$`, start);
  expect(bodyStart).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf(`$${delimiter}$;`, bodyStart + delimiter.length + 5);
  expect(end).toBeGreaterThan(bodyStart);
  return migration.slice(start, end + delimiter.length + 3);
}

describe("System V3 S9/S10 observability authority fixes", () => {
  it("is a forward-only S13 fix with no hosted Supabase endpoint", () => {
    expect(migration).toContain("'v3.s9-s10.workflow-observability-authority-fix-v2'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toMatch(/https:\/\/[^\s'"]+\.supabase\.co/i);
  });

  it("normalizes direct terminal INSERTs as well as UPDATE transitions to wall clock", () => {
    const body = functionBody(
      "private.studio2_operation_receipt_wallclock_completion()",
      "wallclock_completion",
    );
    expect(body).toContain("if tg_op = 'INSERT' then");
    expect(body).toContain("new.status in ('succeeded', 'failed', 'uncertain')");
    expect(body).toContain("new.completed_at := clock_timestamp()");
    expect(migration).toContain("before insert on public.studio2_operation_receipts");
    expect(migration).toContain("studio2_operation_receipts_wallclock_terminal_insert");
    expect(migration).toContain("before update of status, completed_at on public.studio2_operation_receipts");
  });

  it("wraps the proven participant Jury writer in the canonical S2 operation boundary", () => {
    expect(migration).toContain(
      "rename to v3_submit_jury_ballot_legacy_impl",
    );
    expect(migration).toContain(
      "revoke all on function public.v3_submit_jury_ballot_legacy_impl",
    );

    const body = functionBody("public.v3_submit_jury_ballot(", "jury_submit");
    expect(body).toContain("private.studio2_claim_operation(");
    expect(body).toContain("'jury.submit'");
    expect(body).toContain("'R2'");
    expect(body).toContain("public.v3_submit_jury_ballot_legacy_impl(");
    expect(body).toContain("private.studio2_complete_operation(_operation_id, v_result)");
    expect(body).toContain("private.studio2_fail_operation(");
    expect(body).toContain("if v_sqlstate in ('P0001', '22023', '42501', '23514') then");
    expect(body).toContain("raise;");
  });

  it("reconciles failed/uncertain Jury command state from the canonical S2 ledger", () => {
    const body = functionBody(
      "public.v3_reconcile_jury_submission(",
      "jury_reconcile",
    );
    expect(body).toContain("public.v3_reconcile_jury_submission_legacy_impl(_operation_id)");
    expect(body).toContain("from public.studio2_operation_receipts receipt");
    expect(body).toContain("receipt.actor_id = v_actor");
    expect(body).toContain("receipt.command = 'jury.submit'");
    expect(body).toContain("'status', v_receipt.status");
    expect(body).toContain("'error', case");
  });

  it("classifies only the real participant Jury command as jury_submission", () => {
    const body = functionBody(
      "private.v3_observability_workflow_class(",
      "workflow",
    );
    expect(body).toContain("p_command = 'jury.submit'");
    expect(body).toContain("p_command like 'jury.submit.%'");
    expect(body).not.toContain("when p_command like 'jury.%'\n      then 'jury_submission'");
    expect(body).toContain("p_command like 'jury.window.%'");
    expect(body.indexOf("p_command like 'jury.window.%'")).toBeLessThan(
      body.indexOf("p_command = 'jury.submit'"),
    );
  });

  it("does not advertise projection reconciliation as an operation-receipt SLI", () => {
    const classifier = functionBody(
      "private.v3_observability_workflow_class(",
      "workflow",
    );
    expect(classifier).not.toContain("then 'projection_reconciliation'");

    const snapshot = functionBody(
      "public.admin_system_workflow_observability_snapshot(",
      "workflow_snapshot",
    );
    const inventoryStart = snapshot.indexOf("with workflow_classes(workflow_class) as (");
    const classifiedStart = snapshot.indexOf("classified_operations as (", inventoryStart);
    const inventory = snapshot.slice(inventoryStart, classifiedStart);
    expect(inventory).not.toContain("'projection_reconciliation'::text");
    expect(snapshot).toContain("'unavailableOperationScopes', jsonb_build_array('projection_reconciliation')");
    expect(snapshot).toContain("'schemaVersion', 3");
  });

  it("reports latency only from non-negative measured terminal timestamps", () => {
    const body = functionBody(
      "public.admin_system_workflow_observability_snapshot(",
      "workflow_snapshot",
    );
    expect(body).toContain("as operation_latency_samples");
    expect(body).toContain("operation.completed_at >= operation.created_at");
    expect(body).toContain("'operationLatencySamples', operation.operation_latency_samples");
    expect(body).not.toContain("coalesce(round((\n        percentile_cont(0.50)");
  });

  it("keeps exact traces honest when historical timing is malformed", () => {
    const body = functionBody("public.admin_system_operation_trace(", "trace");
    expect(body).toContain("v_operation.completed_at < v_operation.created_at then null");
    expect(body).toContain("'timingMeasured', v_duration_ms is not null");
    expect(body).toContain("greatest(\n    0,");
  });
});

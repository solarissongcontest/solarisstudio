import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261020233000_v3_s9_s10_workflow_observability_hardening.sql",
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

describe("System V3 S9/S10 workflow observability hardening", () => {
  it("is an S13 forward fix and contains no hosted Supabase endpoint", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.s9-s10.workflow-observability-hardening'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toMatch(/https:\/\/[^\s'"]+\.supabase\.co/i);
  });

  it("classifies canonical Jury and Televote window commands as voting transitions", () => {
    const body = functionBody(
      "private.v3_observability_workflow_class(",
      "workflow",
    );
    const transition = body.slice(
      body.indexOf("when p_command in ('jury.open'"),
      body.indexOf("then 'voting_round_transition'") + "then 'voting_round_transition'".length,
    );
    expect(transition).toContain("p_command like 'jury.window.%'");
    expect(transition).toContain("p_command like 'televote.window.%'");
    expect(transition).toContain("p_command like 'jury.round.%'");
    expect(transition).toContain("p_command like 'televote.round.%'");
  });

  it("stamps terminal operation transitions with advancing wall-clock time", () => {
    const body = functionBody(
      "private.v3_stamp_operation_receipt_wallclock_completion()",
      "stamp",
    );
    expect(body).toContain("old.status = 'processing'");
    expect(body).toContain("new.status in ('succeeded', 'failed', 'uncertain')");
    expect(body).toContain("new.completed_at := clock_timestamp()");
    expect(body).toContain("new.updated_at := new.completed_at");
    expect(migration).toContain("before update of status on public.studio2_operation_receipts");
    expect(migration).toContain("execute function private.v3_stamp_operation_receipt_wallclock_completion()");
  });

  it("excludes legacy transaction-stable equal timestamps instead of reporting fake zero latency", () => {
    const body = functionBody(
      "public.admin_system_workflow_observability_snapshot(",
      "workflow_snapshot",
    );
    expect(body).toContain("'operationLatencySamples'");
    expect(body).toContain("operation.completed_at > operation.created_at");
    expect(body).toContain("percentile_cont(0.50)");
    expect(body).toContain("percentile_cont(0.95)");
    expect(body).toContain("percentile_cont(0.99)");
    expect(body).not.toContain(
      "coalesce(round((\n        percentile_cont(0.50)",
    );
    expect(body).toContain("'latencySemantics', 'wall_clock_terminal_transition'");
  });

  it("measures current reconciliation pressure independently of the outcome lookback", () => {
    const body = functionBody(
      "public.admin_system_workflow_observability_snapshot(",
      "workflow_snapshot",
    );
    const reconciliationStart = body.indexOf("current_reconciliation_metrics as (");
    const consequenceStart = body.indexOf("consequence_metrics as (", reconciliationStart);
    expect(reconciliationStart).toBeGreaterThanOrEqual(0);
    expect(consequenceStart).toBeGreaterThan(reconciliationStart);
    const reconciliation = body.slice(reconciliationStart, consequenceStart);
    expect(reconciliation).toContain("receipt.status in ('processing', 'uncertain')");
    expect(reconciliation).not.toContain("receipt.created_at >= v_since");
    expect(body).toContain(
      "'reconciliationPendingOperations', reconciliation.reconciliation_pending_operations",
    );
    expect(body).toContain(
      "'reconciliationSemantics', 'current_unresolved_not_windowed'",
    );
    expect(migration).toContain(
      "studio2_operation_receipts_unresolved_status_command_idx",
    );
    expect(migration).toContain("where status in ('processing', 'uncertain')");
  });

  it("keeps exact traces honest when trustworthy terminal timing does not exist", () => {
    const body = functionBody("public.admin_system_operation_trace(", "trace");
    expect(body).toContain("v_operation.completed_at <= v_operation.created_at then null");
    expect(body).toContain("'timingMeasured', v_duration_ms is not null");
    expect(body).toContain("'durationMs', v_duration_ms");
  });
});

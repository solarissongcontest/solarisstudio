import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261021023000_v3_s9_s10_observability_review_fixes.sql",
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

describe("System V3 S9/S10 observability review hardening", () => {
  it("is a forward-only S13 migration and never embeds hosted Supabase", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.s9-s10.workflow-observability-review-fix-v1'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toMatch(/https:\/\/[^\s'\"]+\.supabase\.co/i);
  });

  it("uses wall-clock receipt timestamps for new claims and terminal transitions", () => {
    expect(migration).toContain("alter column created_at set default clock_timestamp()");
    expect(migration).toContain("alter column updated_at set default clock_timestamp()");
    expect(migration).toContain("studio2_operation_receipts_wallclock_completion");

    const body = functionBody(
      "private.studio2_operation_receipt_wallclock_completion()",
      "wallclock_completion",
    );
    expect(body).toContain("old.status is distinct from new.status");
    expect(body).toContain("new.status in ('succeeded', 'failed', 'uncertain')");
    expect(body).toContain("new.completed_at := clock_timestamp()");
    expect(body).toContain("new.updated_at := new.completed_at");
  });

  it("classifies jury window lifecycle commands as voting-round transitions before generic jury commands", () => {
    const body = functionBody(
      "private.v3_observability_workflow_class(",
      "workflow",
    );
    const juryWindow = body.indexOf("p_command like 'jury.window.%'");
    const genericJury = body.indexOf("p_command like 'jury.%'");
    expect(juryWindow).toBeGreaterThanOrEqual(0);
    expect(genericJury).toBeGreaterThan(juryWindow);
    expect(body.slice(0, genericJury)).toContain("then 'voting_round_transition'");
  });

  it("measures reconciliation pressure from all current unresolved operations, not only the lookback cohort", () => {
    expect(migration).toContain("studio2_operation_receipts_reconciliation_pending_idx");

    const body = functionBody(
      "public.admin_system_workflow_observability_snapshot(",
      "workflow_snapshot",
    );
    const reconciliationStart = body.indexOf("reconciliation_metrics as (");
    const consequenceStart = body.indexOf("consequence_metrics as (");
    const reconciliation = body.slice(reconciliationStart, consequenceStart);

    expect(reconciliationStart).toBeGreaterThanOrEqual(0);
    expect(reconciliation).toContain("receipt.status in ('processing', 'uncertain')");
    expect(reconciliation).not.toContain("receipt.created_at >= v_since");
    expect(body).toContain(
      "'reconciliationPendingOperations', reconciliation.reconciliation_pending_operations",
    );
    expect(body).toContain("'schemaVersion', 2");
  });
});

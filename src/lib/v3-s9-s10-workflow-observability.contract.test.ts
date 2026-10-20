import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { V3_SLO_SCOPES } from "./v3-error-budget";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261020090000_v3_s9_s10_workflow_observability.sql",
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

describe("System V3 S9/S10 workflow observability", () => {
  it("is an additive S13 forward-fix contract and contains no hosted endpoint", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.s9-s10.workflow-observability-v1'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toMatch(/https:\/\/[^\s'\"]+\.supabase\.co/i);
  });

  it("uses exactly the fixed workflow scopes already owned by the S10 error-budget contract", () => {
    const workflowScopes = V3_SLO_SCOPES.filter((scope) => scope !== "system");
    expect(workflowScopes).toEqual([
      "confirmation_submission",
      "entry_mutation",
      "media_review_consequence",
      "jury_submission",
      "televote_submission",
      "voting_round_transition",
      "results_lifecycle",
      "publication",
      "notification_consequence",
      "projection_reconciliation",
    ]);

    const body = functionBody(
      "public.admin_system_workflow_observability_snapshot(",
      "workflow_snapshot",
    );
    for (const scope of workflowScopes) {
      expect(body).toContain(`('${scope}'::text)`);
    }
    expect(body).toContain("'classification', 'fixed_low_cardinality'");
  });

  it("keeps the workflow aggregate bounded, capability-gated and free of high-cardinality labels", () => {
    const body = functionBody(
      "public.admin_system_workflow_observability_snapshot(",
      "workflow_snapshot",
    );
    expect(body).toContain("studio2_access_allowed('system.read', null, false)");
    expect(body).toContain("p_lookback_minutes not between 5 and 10080");
    expect(body).toContain("receipt.created_at >= v_since");

    for (const forbiddenOutputKey of [
      "'actorId'",
      "'operationId'",
      "'correlationId'",
      "'command'",
      "'editionId'",
      "'showId'",
      "'payload'",
      "'errorCode'",
    ]) {
      expect(body).not.toContain(forbiddenOutputKey);
    }
  });

  it("measures outcome, authoritative completion latency, consequence lag and reconciliation pressure per workflow", () => {
    const body = functionBody(
      "public.admin_system_workflow_observability_snapshot(",
      "workflow_snapshot",
    );
    for (const field of [
      "'completedOperations'",
      "'succeededOperations'",
      "'failedOperations'",
      "'uncertainOperations'",
      "'processingOperations'",
      "'reconciliationPendingOperations'",
      "'successRatio'",
      "'p50OperationLatencyMs'",
      "'p95OperationLatencyMs'",
      "'p99OperationLatencyMs'",
      "'consequenceCount'",
      "'completedConsequenceCount'",
      "'unresolvedConsequenceCount'",
      "'p95ConsequenceLagMs'",
    ]) {
      expect(body).toContain(field);
    }
    expect(body).toContain("percentile_cont(0.50)");
    expect(body).toContain("percentile_cont(0.95)");
    expect(body).toContain("percentile_cont(0.99)");
  });

  it("normalizes the exact operation trace without exposing actor, raw scope/object ids or raw error metadata", () => {
    const body = functionBody("public.admin_system_operation_trace(", "trace");
    expect(body).toContain("'operationId'");
    expect(body).toContain("'correlationId'");
    expect(body).toContain("'domain'");
    expect(body).toContain("'workflowClass'");
    expect(body).toContain("'durationMs'");
    expect(body).toContain("'ageMs'");
    expect(body).toContain("'failureClass'");
    expect(body).toContain("'reconciliationState'");

    for (const forbidden of [
      "v_operation.actor_id",
      "'actorId'",
      "'scope'",
      "'aggregateId'",
      "'editionId'",
      "'showId'",
      "'lastErrorCode'",
      "'errorCode'",
    ]) {
      expect(body).not.toContain(forbidden);
    }
  });

  it("keeps S10 derived from S9 projections instead of re-scanning raw ledgers", () => {
    const body = functionBody("public.admin_system_v3_sli_snapshot(", "sli");
    expect(body).toContain("public.admin_system_observability_snapshot(v_window)");
    expect(body).toContain("public.admin_system_workflow_observability_snapshot(v_window)");
    expect(body).toContain("'workflows'");
    expect(body).toContain("'authoritative_submission_latency'");
    expect(body).toContain("'workflow_operation_latency'");
    expect(body).toContain("'workflow_consequence_lag'");
    expect(body).toContain("'workflow_reconciliation_pressure'");
    expect(body).not.toContain("from public.studio2_operation_receipts");
    expect(body).not.toContain("from private.v3_domain_events");
    expect(body).not.toContain("from private.v3_domain_event_outbox");
    expect(body).toContain("'targets', null");
    expect(body).toContain("'errorBudgets', null");
    expect(body).toContain("'alerts', null");
  });
});

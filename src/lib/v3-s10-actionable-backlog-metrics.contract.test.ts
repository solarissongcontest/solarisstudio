import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261018131500_v3_s10_actionable_backlog_metrics.sql",
  ),
  "utf8",
);

function body(startMarker: string, endMarker: string) {
  const start = migration.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("System V3 S10 actionable backlog metrics", () => {
  it("keeps future retries out of actionable pending work", () => {
    const backlog = body(
      "create or replace function public.admin_system_observability_backlog_snapshot(",
      "revoke all on function public.admin_system_observability_backlog_snapshot(integer)",
    );

    expect(backlog).toContain("delivery.status = 'pending'");
    expect(backlog).toContain("delivery.available_at <= now()");
    expect(backlog).toContain("delivery.available_at > now()");
    expect(backlog).toContain("'readyPending'");
    expect(backlog).toContain("'deferredPending'");
    expect(backlog).toContain("'actionable'");
  });

  it("computes oldest actionable age only from ready pending or processing work", () => {
    const backlog = body(
      "create or replace function public.admin_system_observability_backlog_snapshot(",
      "revoke all on function public.admin_system_observability_backlog_snapshot(integer)",
    );

    const metric = backlog.slice(backlog.indexOf("'oldestActionableAgeSeconds'"));
    expect(metric).toContain("delivery.status = 'pending' and delivery.available_at <= now()");
    expect(metric).toContain("or delivery.status = 'processing'");
  });

  it("keeps the backlog projection privacy-safe and system.read gated", () => {
    const backlog = body(
      "create or replace function public.admin_system_observability_backlog_snapshot(",
      "revoke all on function public.admin_system_observability_backlog_snapshot(integer)",
    );

    expect(backlog).toContain("studio2_access_allowed('system.read', null, false)");
    expect(backlog).not.toContain("actor_id");
    expect(backlog).not.toContain("payload");
    expect(backlog).not.toContain("last_error_metadata");
    expect(backlog).not.toContain("lease_owner");
    expect(migration).toContain(
      "revoke all on function public.admin_system_observability_backlog_snapshot(integer)\n  from public, anon;",
    );
  });

  it("keeps S10 derived from S9 projections instead of requerying durability ledgers", () => {
    const sli = body(
      "create or replace function public.admin_system_v3_sli_snapshot(",
      "revoke all on function public.admin_system_v3_sli_snapshot(integer)",
    );

    expect(sli).toContain("public.admin_system_observability_snapshot(v_window)");
    expect(sli).toContain("public.admin_system_observability_backlog_snapshot(v_window)");
    expect(sli).not.toContain("from private.v3_domain_event_outbox");
    expect(sli).not.toContain("from public.studio2_operation_receipts");
  });

  it("surfaces ready, deferred and next-ready measurements without inventing SLO targets", () => {
    const sli = body(
      "create or replace function public.admin_system_v3_sli_snapshot(",
      "revoke all on function public.admin_system_v3_sli_snapshot(integer)",
    );

    expect(sli).toContain("'schemaVersion', 3");
    expect(sli).toContain("'readyPending'");
    expect(sli).toContain("'deferredPending'");
    expect(sli).toContain("'nextDeferredReadyInSeconds'");
    expect(sli).toContain("'targets', null");
    expect(sli).toContain("'errorBudgets', null");
    expect(sli).toContain("'alerts', null");
  });
});

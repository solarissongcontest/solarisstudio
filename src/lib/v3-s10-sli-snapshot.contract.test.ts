import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261017150000_v3_s10_sli_snapshot.sql"),
  "utf8",
);

describe("System V3 S10 measured SLI foundation", () => {
  it("derives S10 from the canonical S9 privacy-safe metrics projection", () => {
    expect(migration).toContain("public.admin_system_observability_snapshot(v_window)");
    expect(migration).toContain("'projection', 'admin_system_observability_snapshot'");
    expect(migration).not.toContain("from public.studio2_operation_receipts");
    expect(migration).not.toContain("from private.v3_domain_events");
    expect(migration).not.toContain("from private.v3_domain_event_outbox");
  });

  it("requires global system.read and a bounded measurement window", () => {
    expect(migration).toContain("studio2_access_allowed('system.read', null, false)");
    expect(migration).toContain("v_window not between 5 and 10080");
    expect(migration).toContain("SLI window must be between 5 and 10080 minutes");
  });

  it("projects operation outcomes, event volume and consequence lag with explicit units", () => {
    expect(migration).toContain("'successRatio'");
    expect(migration).toContain("'domainEvents'");
    expect(migration).toContain("'averageCompletedLagMs'");
    expect(migration).toContain("'p95CompletedLagMs'");
    expect(migration).toContain("'maxCompletedLagMs'");
    expect(migration).toContain("'oldestActionableAgeSeconds'");
    expect(migration).toContain("'expiredProcessingLeases'");
  });

  it("states the current measurement boundary instead of pretending S10 is complete", () => {
    expect(migration).toContain("'state', 'foundation'");
    expect(migration).toContain("'operation_outcomes'");
    expect(migration).toContain("'consequence_completion_lag'");
    expect(migration).toContain("'authoritative_submission_latency'");
    expect(migration).toContain("'core_read_availability'");
    expect(migration).toContain("'projection_freshness_by_projection'");
  });

  it("does not invent SLO targets, error budgets or alerts before baseline review", () => {
    expect(migration).toContain("'targets', null");
    expect(migration).toContain("'errorBudgets', null");
    expect(migration).toContain("'alerts', null");
    expect(migration).not.toContain("0.999");
    expect(migration).not.toContain("0.995");
    expect(migration).not.toContain("1500");
  });

  it("keeps the projection read-only and browser access capability-gated", () => {
    expect(migration).toContain("language plpgsql\nstable\nsecurity definer");
    expect(migration).toContain(
      "revoke all on function public.admin_system_v3_sli_snapshot(integer)\n  from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function public.admin_system_v3_sli_snapshot(integer)\n  to authenticated, service_role;",
    );
    expect(migration).not.toContain("insert into");
    expect(migration).not.toContain("update public.");
    expect(migration).not.toContain("delete from");
  });
});

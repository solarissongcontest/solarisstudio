import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261016211000_v3_s9_safe_metrics.sql"),
  "utf8",
);

function functionBody(name: string) {
  const marker = `create or replace function ${name}`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("comment on function", start);
  return migration.slice(start, end === -1 ? migration.length : end);
}

describe("System V3 S9 privacy-safe operational metrics", () => {
  it("requires global system.read and a bounded diagnostic window", () => {
    const body = functionBody("public.admin_system_observability_snapshot");
    expect(body).toContain("studio2_access_allowed('system.read', null, false)");
    expect(body).toContain("p_lookback_minutes not between 1 and 10080");
    expect(body).toContain("make_interval(mins => p_lookback_minutes)");
  });

  it("measures S2 operation outcomes and success over completed operations", () => {
    const body = functionBody("public.admin_system_observability_snapshot");
    for (const status of ["processing", "succeeded", "failed", "uncertain"]) {
      expect(body).toContain(`receipt.status = '${status}'`);
    }
    expect(body).toContain("'completed'");
    expect(body).toContain("receipt.status in ('succeeded', 'failed', 'uncertain')");
    expect(body).toContain("'successRate'");
    expect(body).toContain("candidate.error_code is not null");
    expect(body).toContain("'oldestProcessingAgeSeconds'");
  });

  it("measures event volume, queue state, retries, dead letters and expired leases", () => {
    const body = functionBody("public.admin_system_observability_snapshot");
    expect(body).toContain("count(distinct event_row.correlation_id)");
    expect(body).toContain("'eventTypeCounts'");
    expect(body).toContain("delivery.attempt_count > 1");
    expect(body).toContain("delivery.status = 'dead_letter'");
    expect(body).toContain("delivery.lease_expires_at <= now()");
    expect(body).toContain("'expiredProcessingLeases'");
    expect(body).toContain("'totalAttempts'");
    expect(body).toContain("sum(delivery.attempt_count)");
    expect(body).toContain("'maxAttempts'");
  });

  it("measures completed consequence lag without inventing an SLO threshold", () => {
    const body = functionBody("public.admin_system_observability_snapshot");
    expect(body).toContain("'averageCompletedLagMs'");
    expect(body).toContain("'p95CompletedLagMs'");
    expect(body).toContain("'maxCompletedLagMs'");
    expect(body).toContain("percentile_cont(0.95)");
    expect(body).toContain("delivery.completed_at - event_row.occurred_at");
    expect(body).not.toContain("sloTarget");
    expect(body).not.toContain("alertThreshold");
  });

  it("does not project private request/result/identity or metadata bodies", () => {
    const body = functionBody("public.admin_system_observability_snapshot");
    expect(body).not.toContain("request_fingerprint");
    expect(body).not.toContain("receipt.result");
    expect(body).not.toContain("event_row.payload");
    expect(body).not.toContain("actor_id");
    expect(body).not.toContain("error_metadata");
    expect(body).not.toContain("result_metadata");
    expect(body).not.toContain("lease_owner");
  });

  it("keeps the projection read-only and inaccessible to anonymous callers", () => {
    expect(migration).toContain("language plpgsql\nstable\nsecurity definer");
    expect(migration).toContain(
      "revoke all on function public.admin_system_observability_snapshot(integer)\n  from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function public.admin_system_observability_snapshot(integer)\n  to authenticated, service_role;",
    );
    expect(migration).not.toContain("insert into");
    expect(migration).not.toContain("update public.");
    expect(migration).not.toContain("delete from");
  });
});

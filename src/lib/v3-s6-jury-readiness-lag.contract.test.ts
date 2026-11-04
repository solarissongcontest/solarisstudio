import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019211100_v3_s6_jury_readiness_lag.sql",
  ),
  "utf8",
);

function functionBody() {
  const marker =
    "create or replace function public.studio2_measure_jury_operational_projection_lag(";
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf(
    "revoke all on function public.studio2_measure_jury_operational_projection_lag",
    start,
  );
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("System V3 S6 Jury readiness lag metric", () => {
  it("registers through the strict semantic S13 migration contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.s6.jury-readiness-lag'");
    expect(migration).toContain("'forward_fix_only'");
  });

  it("derives freshness only from the independently verified canonical read", () => {
    const body = functionBody();
    expect(body).toContain("public.studio2_verify_jury_operational_projection(");
    expect(body).toContain("if v_state = 'consistent' then");
    expect(body).toContain("'freshnessModel', 'synchronous_read_through'");
    expect(body).toContain("'lagSeconds', 0");
  });

  it("fails closed instead of assigning a numeric lag when verification is unknown or drifting", () => {
    const body = functionBody();
    expect(body).toContain("'state', 'unknown'");
    expect(body).toContain("'verification_bound_exceeded'");
    expect(body).toContain("'verification_drift'");
    expect(body).toContain("'lagSeconds', null");
  });

  it("does not use mutable timestamps as a fake freshness source", () => {
    const body = functionBody();
    expect(body).not.toContain("created_at");
    expect(body).not.toContain("updated_at");
    expect(body).not.toContain("completed_at");
    expect(body).not.toContain("extract(epoch");
  });

  it("keeps the metric service-only", () => {
    expect(migration).toContain(
      "revoke all on function public.studio2_measure_jury_operational_projection_lag(uuid, integer, integer)",
    );
    expect(migration).toContain("from public, anon, authenticated;");
    expect(migration).toContain(
      "grant execute on function public.studio2_measure_jury_operational_projection_lag(uuid, integer, integer)\n  to service_role;",
    );
  });
});

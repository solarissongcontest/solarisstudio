import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261024223000_v3_s14_atomic_televote_calculation.sql"),
  "utf8",
);
const conversionServer = readFileSync(
  resolve(process.cwd(), "src/integrations/televoting/conversion.server.ts"),
  "utf8",
);

function functionBody() {
  const marker = "create or replace function televoting.v3_commit_official_round_calculation(";
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("revoke all on function", start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("System V3 S14 atomic official Televote calculation", () => {
  it("registers a forward-only S13 adoption contract", () => {
    expect(migration).toContain("'v3.results.atomic-televote-calculation'");
    expect(migration).toContain("'forward_fix_only'");
  });

  it("restores Organizer capability-scoped access to robust influence evidence", () => {
    expect(migration).toContain("grant select, insert, update, delete");
    expect(migration).toContain("on table televoting.round_influence_results");
    expect(migration).toContain("to authenticated");
    expect(migration).toContain("public.studio2_access_allowed('voting.manage', null, false)");
  });

  it("commits result rows, influence evidence and round lifecycle in one transaction", () => {
    const body = functionBody();
    expect(body).toContain("for update");
    expect(body).toContain("STALE_CALCULATION_VERSION");
    expect(body).toContain("LINEUP_CHANGED");
    expect(body).toContain("RESULT_LINEUP_MISMATCH");
    expect(body).toContain("delete from televoting.round_influence_results");
    expect(body).toContain("delete from televoting.round_results");
    expect(body).toContain("insert into televoting.round_results");
    expect(body).toContain("insert into televoting.round_influence_results");
    expect(body).toContain("results_status = 'calculated'");
    expect(body).toContain("calculation_version = v_next_version");
    expect(body).toContain("results_outdated = false");
  });

  it("keeps the RPC under the caller's Organizer RLS boundary", () => {
    expect(migration).toContain("security invoker");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to authenticated, service_role");
    expect(migration).not.toContain("security definer");
  });

  it("routes the server calculation through the atomic RPC instead of piecemeal writes", () => {
    expect(conversionServer).toContain('"v3_commit_official_round_calculation"');
    expect(conversionServer).not.toContain('.from("round_influence_results").delete().eq("round_id", roundId)');
    expect(conversionServer).not.toContain('.from("round_results").delete().eq("round_id", roundId)');
  });
});

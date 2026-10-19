import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const route = source("src/routes/fantasy/index.tsx");
const screen = source("src/components/v3/V3FantasyScreen.tsx");
const projection = source("src/lib/v3-fantasy.ts");
const migration = source(
  "supabase/migrations/20261019235959_v3_fantasy_participant_authority.sql",
);

describe("V3 Fantasy participant authority", () => {
  it("moves lifecycle and caller roster reads behind one server projection", () => {
    expect(route).toContain('.rpc("v3_fantasy_game"');
    expect(route).toContain('queryKey: ["fantasy-v3-game", activeGameSeed?.id]');
    expect(route).toContain("fantasyProjection.data?.effectiveState");
    expect(route).toContain("fantasyProjection.data?.canEdit === true");
    expect(route).not.toContain('.from("fantasy_teams")');
    expect(route).not.toContain('.from("fantasy_team_entries")');
    expect(route).not.toContain('.from("fantasy_game_entries")');
  });

  it("does not let a device clock open or extend the roster window", () => {
    expect(route).not.toContain("Date.now()");
    expect(route).not.toContain("setInterval(");
    expect(route).not.toContain("resolveV3FantasyState(");
    expect(route).toContain("fantasyBoundaryRefreshDelayMs(fantasyProjection.data)");
    expect(projection).toContain("const serverMs = Date.parse(projection.serverTime)");
    expect(projection).toContain("nextBoundary - serverMs + 250");
  });

  it("uses a caller-safe server projection with publication and server-time gates", () => {
    expect(migration).toContain("create or replace function public.v3_fantasy_game(");
    expect(migration).toContain("v_actor uuid := auth.uid()");
    expect(migration).toContain("v_now timestamptz := now()");
    expect(migration).toContain("edition.published = true");
    expect(migration).toContain("public.show_publication_enabled(game.show_id, 'participants')");
    expect(migration).toContain("team.profile_id = v_actor");
    expect(migration).not.toContain("p_profile_id");
    expect(migration).not.toContain("p_user_id");
    expect(migration).toContain("'serverTime', v_now");
    expect(migration).toContain("'effectiveState', v_effective_state");
  });

  it("adds a forward-only revision without rewriting historical Fantasy state", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("20261019235959_v3_fantasy_participant_authority");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("add column if not exists revision bigint");
    expect(migration).toContain("set revision = 1");
    expect(migration).toContain("fantasy_teams_revision_check");
    expect(migration).not.toMatch(/drop\s+table/i);
    expect(migration).not.toMatch(/truncate/i);
  });

  it("wraps the proven roster validator in canonical idempotency and CAS", () => {
    const claim = migration.indexOf("private.studio2_claim_operation(");
    const cas = migration.indexOf("message = 'VERSION_CONFLICT'");
    const legacyValidator = migration.indexOf("v_team_id := public.submit_fantasy_team(");
    const completion = migration.indexOf("private.studio2_complete_operation(v_operation_id, v_result)");

    expect(claim).toBeGreaterThanOrEqual(0);
    expect(cas).toBeGreaterThan(claim);
    expect(legacyValidator).toBeGreaterThan(cas);
    expect(completion).toBeGreaterThan(legacyValidator);
    expect(migration).toContain("'fantasy.team.submit'");
    expect(migration).toContain("'expectedRevision', p_expected_revision");
    expect(migration).toContain("v_team.revision is distinct from p_expected_revision");
    expect(migration).toContain("team.revision = team.revision + 1");
  });

  it("emits one versioned fact and returns a reconcilable receipt", () => {
    expect(migration).toContain("private.v3_emit_domain_event(");
    expect(migration).toContain("'fantasy.team_submitted'");
    expect(migration).toContain("'fantasy_team'");
    expect(migration).toContain("v_revision,");
    expect(migration).toContain("public.studio2_reconcile_operation(v_operation_id)");
    expect(migration).toContain("'stateVersion', v_revision");
    expect(migration).toContain("'operationId', v_operation_id");
    expect(migration).toContain("'serverTime', now()");
  });

  it("cuts authenticated browsers off the legacy writer", () => {
    expect(migration).toContain(
      "revoke all on function public.submit_fantasy_team(uuid, uuid[], uuid)",
    );
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(route).not.toContain('.rpc("submit_fantasy_team"');
  });

  it("passes a stable operation identity and reconciles a lost response", () => {
    expect(route).toContain('.rpc("v3_submit_fantasy_team"');
    expect(route).toContain("p_expected_revision: fantasyProjection.data.stateVersion");
    expect(route).toContain("p_operation_id: operationId");
    expect(route).toContain("p_idempotency_key: operationId");
    expect(route).toContain('"studio2_reconcile_operation"');
    expect(route).toContain('recovery?.status === "succeeded"');
    expect(route).not.toContain("localStorage");
    expect(route).not.toContain("sessionStorage");
  });

  it("keeps installed-app cutover reversible and preserves server validation messaging", () => {
    expect(route).toContain("useV3RolloutProbe(platformResolved && isAppMode)");
    expect(route).toContain("rollout.data?.enabled === true");
    expect(route).toContain("feature.data === true");
    expect(route).toContain("<V3FantasyScreen");
    expect(route).toContain("<AppShell>");
    expect(screen).toContain("server lock");
    expect(screen).toContain("authoritative scoring workflow");
  });
});

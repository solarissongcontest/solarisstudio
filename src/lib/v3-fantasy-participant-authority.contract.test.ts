import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const migration = source(
  "supabase/migrations/20261024200400_v3_fantasy_participant_authority_current_main.sql",
);
const domainRegistry = source("src/lib/solaris-v6-domain-registry.ts");

describe("V3 Fantasy participant System authority", () => {
  it("registers a semantic S13 forward fix without an unbounded revision backfill", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.fantasy.participant-authority'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain(
      "add column if not exists revision bigint not null default 1",
    );
    expect(migration).not.toMatch(
      /update\s+public\.fantasy_teams\s+set\s+revision/i,
    );
    expect(migration).not.toMatch(/drop\s+table/i);
    expect(migration).not.toMatch(/truncate/i);
  });

  it("keeps participant lifecycle and private roster truth server-owned", () => {
    expect(migration).toContain(
      "create or replace function public.v3_fantasy_game(",
    );
    expect(migration).toContain("v_actor uuid := auth.uid()");
    expect(migration).toContain("v_now timestamptz := now()");
    expect(migration).toContain("edition.published = true");
    expect(migration).toContain(
      "public.show_publication_enabled(game.show_id, 'participants')",
    );
    expect(migration).toContain("team.profile_id = v_actor");
    expect(migration).not.toContain("p_profile_id");
    expect(migration).not.toContain("p_user_id");
    expect(migration).toContain("'serverTime', v_now");
    expect(migration).toContain(
      "'stateVersion', coalesce(v_team.revision, 0)",
    );
  });

  it("claims before mutable checks and serializes CAS before the mature writer", () => {
    const claim = migration.indexOf("private.studio2_claim_operation(");
    const gameLock = migration.indexOf(
      "where game.id = p_game_id\n  for update;",
    );
    const teamLock = migration.indexOf(
      "team.profile_id = v_actor\n  for update;",
    );
    const conflict = migration.indexOf("raise sqlstate 'PT409'");
    const legacyWriter = migration.indexOf(
      "v_team_id := public.submit_fantasy_team(",
    );
    const completion = migration.indexOf(
      "private.studio2_complete_operation(v_operation_id, v_result)",
    );

    expect(claim).toBeGreaterThanOrEqual(0);
    expect(gameLock).toBeGreaterThan(claim);
    expect(teamLock).toBeGreaterThan(gameLock);
    expect(conflict).toBeGreaterThan(teamLock);
    expect(legacyWriter).toBeGreaterThan(conflict);
    expect(completion).toBeGreaterThan(legacyWriter);
    expect(migration).not.toContain("errcode = '40001'");
  });

  it("uses one semantic operation identity and canonical reconciliation", () => {
    expect(migration).toContain("'fantasy.team.submit'");
    expect(migration).toContain("'expectedRevision', p_expected_revision");
    expect(migration).toContain(
      "public.studio2_reconcile_operation(v_operation_id)",
    );
    expect(migration).toContain(
      "private.studio2_complete_operation(v_operation_id, v_result)",
    );
  });

  it("uses canonical Fantasy change vocabulary without duplicating scoring authority", () => {
    expect(domainRegistry).toContain(
      'events: ["fantasy.changed", "fantasy.scored"]',
    );
    expect(migration).toContain("'fantasy.changed'");
    expect(migration).toContain("'change', 'team_submitted'");
    expect(migration).toContain("'fantasy_team'");
    expect(migration).not.toContain("'fantasy.scored'");
    expect(migration).not.toContain("'fantasy.team_submitted'");
  });

  it("emits the DomainEvent before completing the same operation receipt", () => {
    const emit = migration.indexOf("private.v3_emit_domain_event(");
    const complete = migration.indexOf(
      "private.studio2_complete_operation(v_operation_id, v_result)",
    );

    expect(emit).toBeGreaterThanOrEqual(0);
    expect(complete).toBeGreaterThan(emit);
    expect(migration).toContain("v_operation_id,");
    expect(migration).toContain("v_revision,");
  });

  it("cuts browser callers off the legacy submit writer", () => {
    expect(migration).toContain(
      "revoke all on function public.submit_fantasy_team(uuid, uuid[], uuid)",
    );
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).toContain(
      "grant execute on function public.v3_submit_fantasy_team(",
    );
    expect(migration).toContain("to authenticated, service_role");
  });
});

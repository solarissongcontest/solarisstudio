import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { v3DomainConsequence } from "./v3-domain-consequence-registry";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261024200500_v3_fantasy_scoring_authority.sql",
);
const rehearsal = source(
  ".github/scripts/v3-s5-fantasy-score-consequences-rehearsal.sh",
);

describe("System V3 S5 Fantasy scoring authority", () => {
  it("registers one semantic forward-only S13 contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.fantasy.scoring-authority'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toContain("'20261024200500_v3_fantasy_scoring_authority'");
  });

  it("keeps score revisions server-owned without a migration-wide Fantasy backfill", () => {
    expect(migration).toContain("create table if not exists public.studio2_fantasy_score_versions");
    expect(migration).toContain("version bigint not null default 0 check (version >= 0)");
    expect(migration).toContain("private.studio2_fantasy_score_revision");
    expect(migration).toContain("when game.status = 'scored'");
    expect(migration).toContain("team.state = 'scored' or team.score is not null");
    expect(migration).not.toMatch(/insert into public\.studio2_fantasy_score_versions[\s\S]*from public\.fantasy_games game[\s\S]*on conflict \(game_id\) do nothing;/i);
    expect(migration).toContain(
      "revoke all on table public.studio2_fantasy_score_versions from public, anon, authenticated",
    );
  });

  it("claims before mutable authorization/CAS and replays through the durable receipt", () => {
    const claim = migration.indexOf("private.studio2_claim_operation(");
    const replay = migration.indexOf("public.studio2_reconcile_operation(v_operation_id)");
    const lock = migration.indexOf("where game.id = p_game_id\n  for update;");
    const authorization = migration.indexOf("public.studio2_access_allowed('results.preview'", claim);
    const conflict = migration.indexOf("raise sqlstate 'PT409'");
    const scorer = migration.indexOf("select public.score_fantasy_game(p_game_id)");
    const event = migration.indexOf("private.v3_emit_domain_event(");
    const complete = migration.indexOf("private.studio2_complete_operation(v_operation_id, v_result)");

    expect(claim).toBeGreaterThanOrEqual(0);
    expect(replay).toBeGreaterThan(claim);
    expect(lock).toBeGreaterThan(replay);
    expect(authorization).toBeGreaterThan(lock);
    expect(conflict).toBeGreaterThan(authorization);
    expect(scorer).toBeGreaterThan(conflict);
    expect(event).toBeGreaterThan(scorer);
    expect(complete).toBeGreaterThan(event);
    expect(migration).toContain("message = 'VERSION_CONFLICT'");
    expect(migration).not.toContain("errcode = '40001'");
  });

  it("preserves the established formula while removing the browser scorer bypass", () => {
    expect(migration).toContain("public.studio2_fantasy_score_preview");
    expect(migration).toContain("public.studio2_score_fantasy_game");
    expect(migration).toContain("'fantasy.score'");
    expect(migration).toContain("'R2'");
    expect(migration).toContain("select public.score_fantasy_game(p_game_id)");
    expect(migration).toContain("revoke all on function public.score_fantasy_game(uuid)");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });

  it("emits fantasy.scored directly from the same claimed operation and keeps it privacy-bounded", () => {
    expect(migration).toContain("'fantasy.scored'");
    expect(migration).toContain("'fantasy_score'");
    expect(migration).toContain("v_operation_id,");
    expect(migration).toContain("v_next_revision,");
    expect(migration).toContain("'scoredTeamCount'");
    expect(migration).toContain("array[]::text[]");
    expect(migration).not.toContain("profileId");
    expect(migration).not.toContain("userId");
    expect(migration).not.toContain("teamEntries");
    expect(migration).not.toContain("create trigger v3_emit_fantasy_score_operation_event");
  });

  it("marks only fantasy.scored event-backed until fantasy.changed has equivalent consequence proof", () => {
    expect(v3DomainConsequence("fantasy.scored")?.implementationState).toBe("event-backed");
    expect(v3DomainConsequence("fantasy.scored")?.ownerDomain).toBe("fantasy");
    expect(v3DomainConsequence("fantasy.scored")?.taskEffects).toEqual([]);
    expect(v3DomainConsequence("fantasy.changed")?.implementationState).toBe("declared");
  });

  it("retains the isolated rehearsal for first score, replay, stale rollback, rescore and privacy", () => {
    expect(rehearsal).toContain("first Fantasy score revision is not 1");
    expect(rehearsal).toContain("exact Fantasy replay duplicated fantasy.scored");
    expect(rehearsal).toContain("stale Fantasy score revision unexpectedly succeeded");
    expect(rehearsal).toContain("stale Fantasy operation claim escaped rollback");
    expect(rehearsal).toContain("second Fantasy score revision is not 2");
    expect(rehearsal).toContain("aggregate_type='fantasy_score'");
    expect(rehearsal).toContain("legacy Fantasy scorer remains browser callable");
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
  });
});

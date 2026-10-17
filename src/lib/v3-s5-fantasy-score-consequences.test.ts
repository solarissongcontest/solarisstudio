import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { v3DomainConsequence } from "./v3-domain-consequence-registry";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261017120000_v3_s5_fantasy_score_consequences.sql",
);
const organizer = source("src/routes/_authenticated/admin/fantasy.tsx");
const rehearsal = source(
  ".github/scripts/v3-s5-fantasy-score-consequences-rehearsal.sh",
);

describe("System V3 S5 Fantasy score consequences", () => {
  it("keeps score revisions in a server-owned version table", () => {
    expect(migration).toContain("create table if not exists public.studio2_fantasy_score_versions");
    expect(migration).toContain("version bigint not null default 0 check (version >= 0)");
    expect(migration).toContain(
      "revoke all on table public.studio2_fantasy_score_versions from public, anon, authenticated",
    );
    expect(migration).toContain("grant all on table public.studio2_fantasy_score_versions to service_role");
  });

  it("preserves pre-migration scored truth as revision one", () => {
    expect(migration).toContain("when game.status = 'scored'");
    expect(migration).toContain("team.state = 'scored' or team.score is not null");
    expect(migration).toContain("then 1");
  });

  it("wraps the established scorer in an R2 optimistic operation boundary", () => {
    expect(migration).toContain("public.studio2_fantasy_score_preview");
    expect(migration).toContain("public.studio2_score_fantasy_game");
    expect(migration).toContain("'fantasy.score'");
    expect(migration).toContain("'R2'");
    expect(migration).toContain("p_expected_score_revision");
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("select public.score_fantasy_game(p_game_id)");
    expect(migration).toContain("private.studio2_complete_operation(v_canonical_operation_id, v_result)");
    expect(migration).toContain("Fantasy scores changed since this preview was loaded");
  });

  it("uses the existing results capabilities and removes the browser scorer bypass", () => {
    expect(migration).toContain("public.studio2_access_allowed('results.preview'");
    expect(migration).toContain("public.studio2_access_allowed('results.publish'");
    expect(migration).toContain("revoke all on function public.score_fantasy_game(uuid)");
    expect(migration).toContain("from public, anon, authenticated, service_role");
  });

  it("emits fantasy.scored as its own versioned aggregate", () => {
    expect(migration).toContain("new.command <> 'fantasy.score'");
    expect(migration).toContain("'fantasy.scored'");
    expect(migration).toContain("'fantasy_score'");
    expect(migration).toContain("v_score_revision");
    expect(migration).toContain("'scoredTeamCount'");
    expect(migration).toContain("array[]::text[]");
  });

  it("cuts the Organizer scoring action over to preview then canonical apply", () => {
    expect(organizer).toContain('rpc("studio2_fantasy_score_preview"');
    expect(organizer).toContain('rpc("studio2_score_fantasy_game"');
    expect(organizer).toContain("p_expected_score_revision: preview.scoreRevision");
    expect(organizer).toContain("operationId = crypto.randomUUID()");
    expect(organizer).not.toContain('rpc("score_fantasy_game"');
  });

  it("marks only fantasy.scored event-backed until all fantasy.changed mutation paths are migrated", () => {
    expect(v3DomainConsequence("fantasy.scored")?.implementationState).toBe("event-backed");
    expect(v3DomainConsequence("fantasy.scored")?.ownerDomain).toBe("fantasy");
    expect(v3DomainConsequence("fantasy.scored")?.taskEffects).toEqual([]);
    expect(v3DomainConsequence("fantasy.changed")?.implementationState).toBe("declared");
  });

  it("rehearses first score, replay, stale conflict, re-score and legacy denial locally", () => {
    expect(rehearsal).toContain("first Fantasy score revision is not 1");
    expect(rehearsal).toContain("exact Fantasy replay duplicated fantasy.scored");
    expect(rehearsal).toContain("stale Fantasy score revision unexpectedly succeeded");
    expect(rehearsal).toContain("second Fantasy score revision is not 2");
    expect(rehearsal).toContain("aggregate_type='fantasy_score'");
    expect(rehearsal).toContain("legacy Fantasy scorer remains browser callable");
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
  });
});

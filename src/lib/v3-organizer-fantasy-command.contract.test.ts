import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const authority = source(
  "supabase/migrations/20261020004500_v3_fantasy_config_command_authority.sql",
);
const entryVersion = source(
  "supabase/migrations/20261020004600_v3_fantasy_config_entry_version.sql",
);
const client = source("src/lib/v3-organizer-fantasy-command.ts");

describe("V3 Organizer Fantasy config authority", () => {
  it("registers both post-S13 migrations as additive forward fixes", () => {
    for (const [sql, id] of [
      [authority, "20261020004500_v3_fantasy_config_command_authority"],
      [entryVersion, "20261020004600_v3_fantasy_config_entry_version"],
    ] as const) {
      expect(sql).toContain("public.v3_register_migration_contract(");
      expect(sql).toContain(id);
      expect(sql).toContain("'forward_fix_only'");
      expect(sql).not.toMatch(/drop\s+table/i);
      expect(sql).not.toMatch(/truncate/i);
    }
  });

  it("adds a monotonic config version without conflating it with Fantasy scoring", () => {
    expect(authority).toContain("add column if not exists config_version bigint");
    expect(authority).toContain("fantasy_games_config_version_check");
    expect(authority).toContain("private.v3_bump_fantasy_game_config_version()");
    expect(authority).not.toContain("studio2_fantasy_score_versions");
    expect(authority).not.toContain("studio2_score_fantasy_game(");
  });

  it("invalidates stale config when compatibility writers change market entries", () => {
    expect(entryVersion).toContain("private.v3_bump_fantasy_game_config_from_entry()");
    expect(entryVersion).toContain("after insert or update or delete");
    expect(entryVersion).toContain("set config_version = game.config_version + 1");
    expect(entryVersion).toContain("on public.fantasy_game_entries");
  });

  it("normalizes set-like entry input before semantic idempotency fingerprinting", () => {
    expect(entryVersion).toContain("private.v3_normalize_fantasy_config_entries(p_entries jsonb)");
    expect(entryVersion).toContain("item ->> 'countryId', item::text");
    const normalize = authority.indexOf("v_normalized_entries := private.v3_normalize_fantasy_config_entries");
    const request = authority.indexOf("v_request := jsonb_build_object", normalize);
    const claim = authority.indexOf("private.studio2_claim_operation(", request);
    expect(normalize).toBeGreaterThanOrEqual(0);
    expect(request).toBeGreaterThan(normalize);
    expect(claim).toBeGreaterThan(request);
  });

  it("provides one bounded exact-edition Organizer config projection", () => {
    expect(authority).toContain("public.v3_organizer_fantasy_game(");
    expect(authority).toContain("game.edition_id = p_edition_id");
    expect(authority).toContain("limit 1;");
    expect(authority).toContain("public.studio2_access_allowed('edition.manage', p_edition_id, false)");
    expect(authority).toContain("'stateVersion', v_game.config_version");
    expect(authority).toContain("'serverTime', v_server_time");
    expect(authority).toContain("Do not reveal whether the supplied id exists in another edition");
  });

  it("binds save authority to exact edition, target show and existing game subject", () => {
    expect(authority).toContain("public.v3_save_fantasy_game_config(");
    expect(authority).toContain("show.id = p_show_id");
    expect(authority).toContain("show.edition_id = p_edition_id");
    expect(authority).toContain("v_game.edition_id is distinct from p_edition_id");
    expect(authority).toContain("message = 'SCOPE_MISMATCH'");
    expect(authority).toContain("'editionId', p_edition_id");
    expect(authority).toContain("'showId', p_show_id");
    expect(authority).toContain("'subjectId', p_game_id");
  });

  it("claims replay identity before mutable CAS and preserves the mature validator", () => {
    const claim = authority.indexOf("v_claim := private.studio2_claim_operation(");
    const lock = authority.indexOf("for update;", claim);
    const cas = authority.indexOf("message = 'VERSION_CONFLICT'", lock);
    const writer = authority.indexOf("v_game_id := public.studio2_save_fantasy_game(", cas);
    expect(claim).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThan(claim);
    expect(cas).toBeGreaterThan(lock);
    expect(writer).toBeGreaterThan(cas);
    expect(authority).toContain("'fantasy.game.config.save'");
    expect(authority).toContain("'expectedConfigVersion', p_expected_config_version");
    expect(authority).toContain("public.studio2_reconcile_operation(v_operation_id)");
  });

  it("advances a successful V3 save and emits the canonical Fantasy change fact", () => {
    expect(authority).toContain("greatest(game.config_version, p_expected_config_version + 1)");
    expect(authority).toContain("private.v3_emit_domain_event(");
    expect(authority).toContain("'fantasy.changed'");
    expect(authority).toContain("'fantasy_game'");
    expect(authority).toContain("'change', 'config_saved'");
    expect(authority).toContain("v_game.config_version,");
    expect(authority).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
  });

  it("gives the downstream Organizer consumer a fail-closed scoped client contract", () => {
    expect(client).toContain('rpc("v3_organizer_fantasy_game"');
    expect(client).toContain("data.editionId !== editionId");
    expect(client).toContain("data.gameId !== gameId");
    expect(client).toContain('rpc("v3_save_fantasy_game_config"');
    expect(client).toContain("p_expected_config_version: input.expectedConfigVersion");
    expect(client).toContain("p_operation_id: operationId");
    expect(client).toContain("p_idempotency_key: operationId");
    expect(client).toContain("p_correlation_id: operationId");
    expect(client).toContain('"studio2_reconcile_operation"');
    expect(client).toContain('recovery?.status === "succeeded"');
    expect(client).not.toContain("score_fantasy_game");
  });
});

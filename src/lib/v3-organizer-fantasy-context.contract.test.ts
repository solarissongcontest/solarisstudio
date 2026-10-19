import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const fantasy = readFileSync("src/routes/_authenticated/admin/fantasy.tsx", "utf8");
const command = readFileSync("src/lib/v3-organizer-fantasy-command.ts", "utf8");
const fantasyMigration = readFileSync(
  "supabase/migrations/20260920105233_fantasy_entity_identity_fix.sql",
  "utf8",
);
const registry = readFileSync("src/lib/v3-organizer-capability-registry.ts", "utf8");

describe("V3 Organizer Fantasy SSC context", () => {
  it("never evaluates edition-scoped feature state without an edition", () => {
    expect(fantasy).toContain("enabled: Boolean(editionId)");
    expect(fantasy).toContain('editionId ?? "none"');
    expect(fantasy).toContain('isStudio2FeatureEnabled("fantasy_ssc", editionId!)');
    expect(fantasy).toContain("will not substitute a globally active or newest edition");
  });

  it("clears stale game form state on edition switches", () => {
    expect(fantasy).toContain("setShowId(\"\")");
    expect(fantasy).toContain("setName(\"Fantasy SSC\")");
    expect(fantasy).toContain("setCosts({})");
    expect(fantasy).toContain("[editionId]");
    expect(fantasy).toContain("existingGame.editionId !== editionId");
  });

  it("rejects save and scoring commands after edition/show drift", () => {
    expect(fantasy).toContain("function assertExactScope()");
    expect(fantasy).toContain("selectedShow.edition_id !== editionId");
    expect(fantasy).toContain("Edition context changed before the Fantasy SSC command");
    expect(fantasy).toContain("assertExactScope();");
    expect(fantasy).toContain("existingGame.editionId !== editionId");
  });

  it("cuts configuration reads and saves over to the governed #630 contracts", () => {
    expect(fantasy).toContain("getV3OrganizerFantasyGame(editionId!)");
    expect(fantasy).toContain("saveV3FantasyGameConfig({");
    expect(fantasy).toContain("expectedConfigVersion: existing.data?.stateVersion ?? 0");
    expect(fantasy).not.toContain('.from("fantasy_games")');
    expect(fantasy).not.toContain('.from("fantasy_game_entries")');
    expect(fantasy).not.toContain('rpc("studio2_save_fantasy_game"');
    expect(command).toContain('rpc("v3_organizer_fantasy_game"');
    expect(command).toContain('rpc("v3_save_fantasy_game_config"');
    expect(command).toContain('"studio2_reconcile_operation"');
  });

  it("preserves the mature domain validator behind the System wrapper", () => {
    expect(fantasyMigration).toContain("studio2_access_allowed('edition.manage', _edition_id, false)");
    expect(fantasyMigration).toContain("Fantasy game belongs to a different edition");
    expect(fantasyMigration).toContain("Fantasy show does not belong to the selected edition");
    expect(fantasyMigration).toContain("for update");
  });

  it("keeps scoring on its existing authority until #787 lands", () => {
    expect(fantasy).toContain("#787 owns the canonical scoring operation");
    expect(fantasy).toContain('rpc("score_fantasy_game"');
    expect(fantasy).not.toContain('rpc("studio2_score_fantasy_game"');
  });

  it("records Fantasy SSC as building until config + scoring cutover are both certified", () => {
    expect(registry).toContain('id === "workspace-fantasy"');
  });
});

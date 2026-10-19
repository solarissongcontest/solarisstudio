import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261020003500_v3_o6_lineup_entry_sync_qualifier_authority.sql",
  ),
  "utf8",
);
const client = readFileSync(
  resolve(process.cwd(), "src/lib/v3-show-lineup-entry-operations.ts"),
  "utf8",
);

describe("V3 O6 line-up entry sync and qualifier authority", () => {
  it("registers the additive S13 migration contract", () => {
    expect(migration).toContain("'v3.o6.lineup-entry-sync-qualifier-authority'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("false,");
  });

  it("builds a deterministic edition entry-detail stateVersion", () => {
    expect(migration).toContain("private.v3_edition_entry_detail_snapshot");
    expect(migration).toContain("'contestEntityId', rows.contest_entity_id");
    expect(migration).toContain("'artist', rows.artist");
    expect(migration).toContain("'song', rows.song");
    expect(migration).toContain("'updatedAt', rows.updated_at");
    expect(migration).toContain("extensions.digest(");
    expect(migration).toContain("'stateVersion'");
  });

  it("selects one deterministic newest source per identity and only blank targets", () => {
    expect(migration).toContain("private.v3_entry_detail_sync_targets");
    expect(migration).toContain(
      "partition by coalesce(p.country_id, p.contest_entity_id, p.id)",
    );
    expect(migration).toContain("order by p.updated_at desc, p.id desc");
    expect(migration).toContain("p.artist is null\n      and p.song is null");
    expect(migration).toContain("'sourceParticipantId'");
  });

  it("governs one show entry edit through show locking and lineup CAS", () => {
    const commandIndex = migration.indexOf("'show.lineup.entry.update'");
    const lockIndex = migration.indexOf("perform private.v3_lock_show_lineup(p_show_id)", commandIndex);
    const casIndex = migration.indexOf(
      "v_before := private.v3_assert_show_lineup_version(",
      lockIndex,
    );
    expect(commandIndex).toBeGreaterThan(-1);
    expect(lockIndex).toBeGreaterThan(commandIndex);
    expect(casIndex).toBeGreaterThan(lockIndex);
    expect(migration).toContain("p.id = p_participant_id\n    and p.show_id = p_show_id");
    expect(migration).toContain("'show.lineup_entry_updated'");
  });

  it("syncs edition entry details in one authoritative operation with CAS", () => {
    expect(migration).toContain("'entry.details.sync'");
    expect(migration).toContain("perform 1\n  from public.participants p\n  where p.edition_id = p_edition_id");
    expect(migration).toContain("message = 'VERSION_CONFLICT'");
    expect(migration).toContain("with source_ranked as (");
    expect(migration).toContain("update public.participants p");
    expect(migration).toContain("get diagnostics v_affected = row_count");
    expect(migration).toContain("'entry.details_synced'");
    expect(migration).toContain("'affectedCount', v_affected");
  });

  it("derives qualifier candidates from canonical qualified participants", () => {
    expect(migration).toContain("private.v3_show_qualifier_candidates");
    expect(migration).toContain("if v_kind not in ('grand-final', 'final')");
    expect(migration).toContain("p.qualified is true");
    expect(migration).toContain("p.show_id is distinct from p_show_id");
    expect(migration).toContain("not exists (\n        select 1 from target_identity target");
    expect(migration).toContain("row_number() over (");
  });

  it("binds promotion to candidate+lineup state and preserves source provenance", () => {
    expect(migration).toContain("private.v3_show_qualifier_snapshot");
    expect(migration).toContain("'lineupStateVersion', v_lineup ->> 'stateVersion'");
    expect(migration).toContain("'show.qualifiers.promote'");
    expect(migration).toContain("p_expected_state_version");
    expect(migration).toContain("'sourceParticipantId', v_candidate ->> 'sourceParticipantId'");
    expect(migration).toContain("'targetParticipantId', v_target_id");
    expect(migration).toContain("'show.qualifiers_promoted'");
    expect(migration).toContain("'provenance', v_promoted");
  });

  it("uses S2 idempotency and durable reconciliation for all three mutations", () => {
    for (const command of [
      "show.lineup.entry.update",
      "entry.details.sync",
      "show.qualifiers.promote",
    ]) {
      expect(migration).toContain(`'${command}'`);
    }
    expect(migration.match(/private\.studio2_claim_operation\(/g)?.length).toBe(3);
    expect(migration.match(/private\.studio2_complete_operation\(/g)?.length).toBe(3);
    expect(migration.match(/public\.studio2_reconcile_operation\(v_operation_id\)/g)?.length).toBe(6);
  });

  it("provides typed preflight/mutation clients without direct participant writes", () => {
    expect(client).toContain("getV3EntryDetailSyncPreflight");
    expect(client).toContain("getV3ShowQualifierPreflight");
    expect(client).toContain("updateV3ShowLineupEntry");
    expect(client).toContain("syncV3EditionEntryDetails");
    expect(client).toContain("promoteV3ShowQualifiers");
    expect(client).toContain('rpc("studio2_update_show_lineup_entry"');
    expect(client).toContain('rpc("studio2_sync_edition_entry_details"');
    expect(client).toContain('rpc("studio2_promote_show_qualifiers"');
    expect(client).not.toContain('.from("participants")');
  });
});

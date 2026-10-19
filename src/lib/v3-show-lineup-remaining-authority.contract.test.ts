import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const memberEntityMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261020004500_v3_show_lineup_member_entity_authority.sql"),
  "utf8",
);
const entryQualifierMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261020004600_v3_show_lineup_entry_qualifier_authority.sql"),
  "utf8",
);
const preflightMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261020004700_v3_show_lineup_remaining_preflights.sql"),
  "utf8",
);
const server = readFileSync(
  resolve(process.cwd(), "src/lib/admin-lineup-maintenance.functions.ts"),
  "utf8",
);

describe("#598 remaining governed line-up authority", () => {
  it("stays additive and registered through S13", () => {
    for (const [source, id] of [
      [memberEntityMigration, "v3.show-lineup-member-entity-authority"],
      [entryQualifierMigration, "v3.show-lineup-entry-qualifier-authority"],
      [preflightMigration, "v3.show-lineup-remaining-preflights"],
    ] as const) {
      expect(source).toContain("public.v3_register_migration_contract(");
      expect(source).toContain(`'${id}'`);
      expect(source).toContain("'forward_fix_only'");
    }
  });

  it("reuses #1263 canonical line-up state instead of introducing another source of truth", () => {
    expect(memberEntityMigration).toContain("private.v3_show_lineup_state_payload(p_show_id)");
    expect(memberEntityMigration).toContain("private.v3_show_lineup_state_version(p_show_id)");
    expect(entryQualifierMigration).toContain("private.v3_show_lineup_state_payload(p_show_id)");
    expect(entryQualifierMigration).toContain("private.v3_show_lineup_state_version(p_show_id)");
    expect(preflightMigration).toContain("private.v3_show_lineup_state_version(p_show_id)");
    expect(memberEntityMigration).not.toContain("v3_show_lineup_snapshot");
  });

  it("reuses declared show.changed and edition.changed event vocabulary", () => {
    expect(memberEntityMigration).toContain("'show.changed'");
    expect(memberEntityMigration).toContain("'edition.changed'");
    expect(entryQualifierMigration).toContain("'edition.changed'");
    expect(entryQualifierMigration).not.toContain("'show.lineup_member_added'");
    expect(entryQualifierMigration).not.toContain("'show.qualifiers_promoted'");
  });

  it("blocks member removal when canonical result or voting facts still bind the identity", () => {
    for (const relation of [
      "public.results",
      "public.jury_votes",
      "public.jury_ballot_statuses",
      "public.jury_ballot_submissions",
      "public.televote_votes",
      "public.voters",
    ]) {
      expect(memberEntityMigration).toContain(relation);
    }
    expect(memberEntityMigration).toContain("'canRemove', v_total = 0");
    expect(memberEntityMigration).toContain("message = 'DEPENDENCY_FAILURE'");
    expect(memberEntityMigration).toContain("message = 'REASON_REQUIRED'");
  });

  it("creates missing global identity or custom identity atomically with show membership", () => {
    expect(memberEntityMigration).toContain("v_action not in ('add_member', 'create_custom_member', 'remove_member')");
    expect(memberEntityMigration).toContain("p_edition_id, 'global', v_country_id");
    expect(memberEntityMigration).toContain("'custom'");
    expect(memberEntityMigration).toContain("insert into public.participants(");
    expect(memberEntityMigration).toContain("MEMBER_ALREADY_EXISTS");
  });

  it("discovers the live FK graph before destructive custom identity deletion", () => {
    expect(memberEntityMigration).toContain("pg_catalog.pg_constraint");
    expect(memberEntityMigration).toContain("con.confrelid = 'public.contest_entities'::regclass");
    expect(memberEntityMigration).toContain("'deleteAction'");
    expect(memberEntityMigration).toContain("private.studio2_require_fresh_auth(300)");
    expect(memberEntityMigration).toContain("case when v_action = 'delete' then 'R3' else 'R2' end");
  });

  it("makes show entry edits and edition sync idempotent CAS operations", () => {
    expect(entryQualifierMigration).toContain("'show.lineup.entry.update'");
    expect(entryQualifierMigration).toContain("private.v3_lock_show_lineup_expected(");
    expect(entryQualifierMigration).toContain("'entry.details.sync'");
    expect(entryQualifierMigration).toContain("message = 'VERSION_CONFLICT'");
    expect(entryQualifierMigration).toContain("get diagnostics v_affected = row_count");
    expect(entryQualifierMigration.match(/private\.studio2_claim_operation\(/g)?.length).toBe(3);
    expect(entryQualifierMigration.match(/private\.studio2_complete_operation\(/g)?.length).toBe(3);
  });

  it("syncs only fully blank entry-detail targets from one deterministic newest source", () => {
    expect(entryQualifierMigration).toContain(
      "partition by coalesce(p.country_id, p.contest_entity_id, p.id)",
    );
    expect(entryQualifierMigration).toContain("order by p.updated_at desc, p.id desc");
    expect(entryQualifierMigration).toContain("p.artist is null\n      and p.song is null");
  });

  it("promotes only canonical qualified candidates and records source-to-target provenance", () => {
    expect(entryQualifierMigration).toContain("v_kind not in ('grand-final', 'final')");
    expect(entryQualifierMigration).toContain("p.qualified is true");
    expect(entryQualifierMigration).toContain("'show.lineup.promote.qualifiers'");
    expect(entryQualifierMigration).toContain("'sourceParticipantId'");
    expect(entryQualifierMigration).toContain("'targetParticipantId'");
    expect(entryQualifierMigration).toContain("'provenance', v_promoted");
  });

  it("server adapters reconcile a known operation before fresh preflight", () => {
    expect(server).toContain("async function reconcileBeforeRetry");
    expect(server).toContain('rpc("studio2_reconcile_operation"');
    expect(server).toContain('rpc("v3_show_lineup_state_preflight"');
    expect(server).toContain('rpc("v3_show_lineup_member_preflight"');
    expect(server).toContain('rpc("v3_custom_contest_entity_preflight"');
    expect(server).toContain('rpc("v3_entry_detail_sync_preflight"');
    expect(server).toContain('rpc("v3_show_qualifier_preflight"');
  });

  it("does not restore direct browser/database table mutation in the server adapter", () => {
    expect(server).not.toContain('.from("participants")');
    expect(server).not.toContain('.from("contest_entities")');
    expect(server).toContain('rpc("v3_execute_show_lineup_member_operation"');
    expect(server).toContain('rpc("v3_execute_custom_contest_entity_operation"');
    expect(server).toContain('rpc("v3_execute_show_entry_detail_update"');
    expect(server).toContain('rpc("v3_execute_entry_detail_sync"');
    expect(server).toContain('rpc("v3_execute_show_qualifier_promotion"');
  });
});

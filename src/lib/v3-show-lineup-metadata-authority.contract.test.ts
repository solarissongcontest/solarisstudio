import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261020005000_v3_show_lineup_metadata_authority.sql"),
  "utf8",
);
const server = readFileSync(
  resolve(process.cwd(), "src/lib/admin-lineup-metadata.functions.ts"),
  "utf8",
);

describe("#598 governed line-up metadata authority", () => {
  it("registers one additive S13 migration and reuses canonical event names", () => {
    expect(migration).toContain("'v3.show-lineup-metadata-authority'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("'show.changed'");
    expect(migration).toContain("'edition.changed'");
    expect(migration).not.toContain("'show.lineup_entry_updated'");
  });

  it("derives neutral show CAS state from the #1263 canonical line-up version", () => {
    expect(migration).toContain("public.v3_show_lineup_state_preflight");
    expect(migration).toContain("private.v3_show_lineup_state_payload(p_show_id)");
    expect(migration).toContain("private.v3_show_lineup_state_version(p_show_id)");
    expect(migration).toContain("studio2_access_allowed('entry.edit', p_edition_id, true)");
  });

  it("moves global edition identity creation behind an idempotent server operation", () => {
    expect(migration).toContain("public.v3_ensure_global_contest_entity");
    expect(migration).toContain("'contest.entity.global.ensure'");
    expect(migration).toContain("perform 1 from public.editions e where e.id = p_edition_id for update");
    expect(migration).toContain("where e.edition_id = p_edition_id and e.country_id = p_country_id");
    expect(migration).toContain("'global_contest_entity_created'");
  });

  it("discovers the actual contest-entity FK graph before custom deletion", () => {
    expect(migration).toContain("private.v3_contest_entity_dependency_summary");
    expect(migration).toContain("pg_catalog.pg_constraint");
    expect(migration).toContain("con.confrelid = 'public.contest_entities'::regclass");
    expect(migration).toContain("'deleteAction'");
    expect(migration).toContain("'canDelete', v_total = 0");
  });

  it("governs custom identity create/update/delete with R3 fresh-auth deletion", () => {
    expect(migration).toContain("public.v3_execute_custom_contest_entity_operation");
    expect(migration).toContain("v_action not in ('create', 'update', 'delete')");
    expect(migration).toContain("case when v_action = 'delete' then 'R3' else 'R2' end");
    expect(migration).toContain("private.studio2_require_fresh_auth(300)");
    expect(migration).toContain("message = 'REASON_REQUIRED'");
    expect(migration).toContain("message = 'DEPENDENCY_FAILURE'");
    expect(migration).toContain("v_entity.updated_at is distinct from p_expected_updated_at");
  });

  it("uses deterministic edition detail state and newest-source selection", () => {
    expect(migration).toContain("private.v3_edition_entry_detail_state");
    expect(migration).toContain("private.v3_entry_detail_sync_targets");
    expect(migration).toContain(
      "partition by coalesce(p.country_id, p.contest_entity_id, p.id)",
    );
    expect(migration).toContain("order by p.updated_at desc, p.id desc");
    expect(migration).toContain("p.artist is null\n      and p.song is null");
  });

  it("governs single entry metadata edit through show lock plus CAS", () => {
    expect(migration).toContain("'show.lineup.entry.update'");
    expect(migration).toContain("from public.shows s where s.id = p_show_id for update");
    expect(migration).toContain("where p.show_id = p_show_id order by p.id for update");
    expect(migration).toContain("v_before_version is distinct from p_expected_state_version");
    expect(migration).toContain("'changeKind', 'entry_detail_updated'");
  });

  it("replaces Promise.all browser updates with one atomic edition sync", () => {
    expect(migration).toContain("'entry.details.sync'");
    expect(migration).toContain("where p.edition_id = p_edition_id order by p.id for update");
    expect(migration).toContain("get diagnostics v_affected = row_count");
    expect(migration).toContain("'changeKind', 'entry_details_synced'");
    expect(migration).toContain("'affectedCount', v_affected");
  });

  it("uses S2 idempotency and durable reconciliation for all four mutation contracts", () => {
    expect(migration.match(/private\.studio2_claim_operation\(/g)?.length).toBe(4);
    expect(migration.match(/private\.studio2_complete_operation\(/g)?.length).toBe(4);
    expect(migration.match(/public\.studio2_reconcile_operation\(v_operation_id\)/g)?.length).toBe(8);
  });

  it("server adapters reconcile known operation IDs before fresh preflight", () => {
    expect(server).toContain("async function reconcileKnown");
    expect(server).toContain('rpc("studio2_reconcile_operation"');
    expect(server).toContain('rpc("v3_show_lineup_state_preflight"');
    expect(server).toContain('rpc("v3_custom_contest_entity_preflight"');
    expect(server).toContain('rpc("v3_entry_detail_sync_preflight"');
  });

  it("server adapters expose no direct participants or contest_entities CRUD", () => {
    expect(server).not.toContain('.from("participants")');
    expect(server).not.toContain('.from("contest_entities")');
    expect(server).toContain('rpc("v3_ensure_global_contest_entity"');
    expect(server).toContain('rpc("v3_execute_custom_contest_entity_operation"');
    expect(server).toContain('rpc("v3_execute_show_entry_detail_update"');
    expect(server).toContain('rpc("v3_execute_entry_detail_sync"');
  });
});

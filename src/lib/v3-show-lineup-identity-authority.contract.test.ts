import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261024223300_v3_show_lineup_identity_authority.sql",
  ),
  "utf8",
);
const server = readFileSync(
  resolve(process.cwd(), "src/lib/admin-lineup-metadata.functions.ts"),
  "utf8",
);

describe("#598 remaining contest identity authority", () => {
  it("registers one additive forward-only S13 migration", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.show-lineup-identity-authority'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("false,");
  });

  it("moves global edition identity creation behind an idempotent R2 command", () => {
    expect(migration).toContain("public.v3_ensure_global_contest_entity");
    expect(migration).toContain("'contest.entity.global.ensure'");
    expect(migration).toContain("'R2'");
    expect(migration).toContain("public.studio2_access_allowed('entry.edit', p_edition_id, true)");
    expect(migration).toContain("from public.editions e\n  where e.id = p_edition_id\n  for update");
    expect(migration).toContain("where e.edition_id = p_edition_id\n    and e.country_id = p_country_id");
    expect(migration).toContain("'changeKind', 'global_contest_entity_created'");
  });

  it("returns an existing edition country identity instead of duplicating it", () => {
    expect(migration).toContain("if v_entity.id is null then");
    expect(migration).toContain("insert into public.contest_entities(");
    expect(migration).toContain("'created', v_created");
  });

  it("discovers the live contest-entity FK graph before destructive deletion", () => {
    expect(migration).toContain("private.v3_contest_entity_dependency_summary");
    expect(migration).toContain("pg_catalog.pg_constraint");
    expect(migration).toContain("con.confrelid = 'public.contest_entities'::regclass");
    expect(migration).toContain("array_length(con.conkey, 1) = 1");
    expect(migration).toContain("'deleteAction'");
    expect(migration).toContain("'canDelete', v_total = 0");
    expect(migration).toContain("execute format(");
  });

  it("preflights only an exact-edition custom identity", () => {
    expect(migration).toContain("public.v3_custom_contest_entity_preflight");
    expect(migration).toContain("e.id = p_entity_id");
    expect(migration).toContain("e.edition_id = p_edition_id");
    expect(migration).toContain("e.entity_type = 'custom'");
    expect(migration).toContain("'deleteRiskClass', 'R3'");
  });

  it("governs custom create/update/delete with optimistic update versioning", () => {
    expect(migration).toContain("public.v3_execute_custom_contest_entity_operation");
    expect(migration).toContain("v_action not in ('create', 'update', 'delete')");
    expect(migration).toContain("'contest.entity.custom.' || v_action");
    expect(migration).toContain("v_entity.updated_at is distinct from p_expected_updated_at");
    expect(migration).toContain("message = 'VERSION_CONFLICT'");
    expect(migration).toContain("updated_at = now()");
  });

  it("makes custom deletion R3, fresh-authenticated, reasoned and fail-closed", () => {
    expect(migration).toContain("case when v_action = 'delete' then 'R3' else 'R2' end");
    expect(migration).toContain("private.studio2_require_fresh_auth(300)");
    expect(migration).toContain("message = 'REASON_REQUIRED'");
    expect(migration).toContain("message = 'DEPENDENCY_FAILURE'");
    expect(migration).toContain("detail = v_dependencies::text");
  });

  it("reuses the canonical edition.changed event rather than adding another event vocabulary", () => {
    expect(migration).toContain("'edition.changed'");
    expect(migration).not.toContain("'contest_entity.custom_updated'");
    expect(migration).not.toContain("'contest_entity.custom_deleted'");
  });

  it("uses S2 semantic idempotency and durable reconciliation for both mutation families", () => {
    expect(migration.match(/private\.studio2_claim_operation\(/g)?.length).toBe(2);
    expect(migration.match(/private\.studio2_complete_operation\(/g)?.length).toBe(2);
    expect(migration.match(/public\.studio2_reconcile_operation\(v_operation_id\)/g)?.length).toBe(4);
  });

  it("server adapters reconcile known operations before issuing a fresh write", () => {
    expect(server).toContain("async function reconcileKnownOperation");
    expect(server).toContain('rpc("studio2_reconcile_operation"');
    expect(server).toContain("const recovered = await reconcileKnownOperation(client, data.operationId)");
    expect(server).toContain('rpc("v3_ensure_global_contest_entity"');
    expect(server).toContain('"v3_custom_contest_entity_preflight"');
    expect(server).toContain('"v3_execute_custom_contest_entity_operation"');
  });

  it("keeps authoritative identity writes out of direct table CRUD in the adapter", () => {
    expect(server).not.toContain('.from("contest_entities")');
    expect(server).not.toContain('.from("participants")');
    expect(server).not.toContain("syncEditionEntryDetails");
    expect(server).not.toContain("updateShowLineupEntryDetails");
  });
});

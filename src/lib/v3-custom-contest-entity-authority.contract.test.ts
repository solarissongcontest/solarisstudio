import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261020002500_v3_o6_custom_contest_entity_authority.sql",
  ),
  "utf8",
);
const client = readFileSync(
  resolve(process.cwd(), "src/lib/v3-custom-contest-entity-operations.ts"),
  "utf8",
);

describe("V3 O6 custom contest-entity authority", () => {
  it("registers an additive forward-only S13 migration", () => {
    expect(migration).toContain("'v3.o6.custom-contest-entity-authority'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("false,");
  });

  it("discovers the actual contest-entity FK graph for destructive preflight", () => {
    expect(migration).toContain("private.v3_contest_entity_dependency_summary");
    expect(migration).toContain("pg_catalog.pg_constraint");
    expect(migration).toContain("con.confrelid = 'public.contest_entities'::regclass");
    expect(migration).toContain("execute format(");
    expect(migration).toContain("'deleteAction'");
    expect(migration).toContain("'canDelete', v_total = 0");
  });

  it("atomically creates a custom identity and its show membership", () => {
    const createIndex = migration.indexOf("public.studio2_create_custom_show_entity");
    const entityInsert = migration.indexOf("insert into public.contest_entities", createIndex);
    const participantInsert = migration.indexOf("insert into public.participants", entityInsert);
    expect(createIndex).toBeGreaterThan(-1);
    expect(entityInsert).toBeGreaterThan(createIndex);
    expect(participantInsert).toBeGreaterThan(entityInsert);
    expect(migration).toContain("perform private.v3_lock_show_lineup(p_show_id)");
    expect(migration).toContain("private.v3_assert_show_lineup_version(");
    expect(migration).toContain("'show.custom_entity.create'");
  });

  it("uses optimistic entity versioning for updates", () => {
    expect(migration).toContain("'contest_entity.custom.update'");
    expect(migration).toContain("e.entity_type = 'custom'");
    expect(migration).toContain("for update");
    expect(migration).toContain("v_entity.updated_at is distinct from p_expected_updated_at");
    expect(migration).toContain("message = 'VERSION_CONFLICT'");
    expect(migration).toContain("updated_at = now()");
  });

  it("makes deletion R3, fresh-authenticated, reasoned and dependency-safe", () => {
    expect(migration).toContain("'contest_entity.custom.delete'");
    expect(migration).toContain("'R3'");
    expect(migration).toContain("private.studio2_require_fresh_auth(300)");
    expect(migration).toContain("if p_entity_id is null or p_expected_updated_at is null or v_reason is null");
    expect(migration).toContain("message = 'DEPENDENCY_FAILURE'");
    expect(migration).toContain("'freshAuth', v_auth_evidence");
  });

  it("claims operations before mutable-state CAS so successful lost responses can replay", () => {
    for (const command of [
      "show.custom_entity.create",
      "contest_entity.custom.update",
      "contest_entity.custom.delete",
    ]) {
      const commandIndex = migration.indexOf(`'${command}'`);
      const claimIndex = migration.lastIndexOf("private.studio2_claim_operation(", commandIndex);
      expect(commandIndex).toBeGreaterThan(-1);
      expect(claimIndex).toBeGreaterThan(-1);
    }
    expect(migration.match(/public\.studio2_reconcile_operation\(v_operation_id\)/g)?.length).toBe(6);
  });

  it("emits completed facts and durable operation results", () => {
    expect(migration).toContain("'show.custom_entity_created'");
    expect(migration).toContain("'contest_entity.custom_updated'");
    expect(migration).toContain("'contest_entity.custom_deleted'");
    expect(migration.match(/private\.studio2_complete_operation\(/g)?.length).toBe(3);
  });

  it("provides typed R2/R3 client adapters without direct table CRUD", () => {
    expect(client).toContain("getV3CustomContestEntityPreflight");
    expect(client).toContain("createV3CustomShowEntity");
    expect(client).toContain("updateV3CustomContestEntity");
    expect(client).toContain("deleteV3CustomContestEntity");
    expect(client).toContain('riskClass: "R3"');
    expect(client).toContain('rpc("studio2_delete_custom_contest_entity"');
    expect(client).not.toContain('.from("contest_entities")');
  });
});

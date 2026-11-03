import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { TERRA_GOVERNANCE_TG4_MIGRATIONS } from "./terra-governance-domain-registry";

const migrationName = "20261103170100_v3_tg4_world_document_hierarchy_cycles.sql";
const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8",
);

describe("Terra Solaris Governance TG4 provision hierarchy cycle protection", () => {
  it("registers a migration after the existing parent-presence and reverse-parent guards", () => {
    expect(TERRA_GOVERNANCE_TG4_MIGRATIONS.at(-2)).toBe(
      "20261103165900_v3_tg4_world_document_hierarchy_integrity.sql",
    );
    expect(TERRA_GOVERNANCE_TG4_MIGRATIONS.at(-1)).toBe(migrationName);
  });

  it("traverses the final same-Version parent graph instead of relying on direct self-parent checks", () => {
    expect(sql).toContain("with recursive ancestors as");
    expect(sql).toContain("where row.id = new.id");
    expect(sql).toContain("parent.document_version_id = new.document_version_id");
    expect(sql).toContain("parent.provision_id = ancestor.parent_provision_id");
    expect(sql).toContain("parent.provision_id = any(ancestor.visited)");
    expect(sql).toContain("where not ancestor.is_cycle");
    expect(sql).toContain("PROVISION_HIERARCHY_CYCLE");
  });

  it("enforces acyclicity in the database and defers it across atomic draft replacement", () => {
    expect(sql).toContain("create constraint trigger world_document_version_provisions_cycle_guard");
    expect(sql).toContain("after insert or update of document_version_id, provision_id, parent_provision_id");
    expect(sql).toContain("deferrable initially deferred");
    expect(sql).toContain("for each row execute function private.world_document_version_provision_cycle_guard()");
    expect(sql).toContain("set search_path = pg_catalog");
    expect(sql).toContain("revoke all on function private.world_document_version_provision_cycle_guard()");
  });

  it("adopts the migration via the existing S13 semantic ledger", () => {
    expect(sql).toContain("'v3.tg4.world-document-hierarchy-cycles'");
    expect(sql).toContain("public.v3_register_migration_contract");
    expect(sql).toContain("'forward_fix_only'");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261103165900_v3_tg4_world_document_hierarchy_integrity.sql",
  ),
  "utf8",
);

describe("Terra Solaris Governance TG4 provision hierarchy integrity", () => {
  it("prevents deleting or retargeting a parent while a child survives in the same Version", () => {
    expect(migration).toContain("private.world_document_version_parent_reverse_guard");
    expect(migration).toContain("child_row.document_version_id = v_old_version_id");
    expect(migration).toContain("child_row.parent_provision_id = v_old_provision_id");
    expect(migration).toContain("parent_row.provision_id = v_old_provision_id");
    expect(migration).toContain("PROVISION_PARENT_NOT_IN_VERSION");
  });

  it("defers the reverse hierarchy check so atomic draft replacement can delete and rebuild the tree", () => {
    expect(migration).toContain("create constraint trigger world_document_version_provisions_parent_reverse_guard");
    expect(migration).toContain("after delete or update of document_version_id, provision_id");
    expect(migration).toContain("deferrable initially deferred");
  });

  it("registers the hierarchy migration in the S13 semantic ledger", () => {
    expect(migration).toContain("'v3.tg4.world-document-hierarchy-integrity'");
    expect(migration).toContain("public.v3_register_migration_contract");
  });
});

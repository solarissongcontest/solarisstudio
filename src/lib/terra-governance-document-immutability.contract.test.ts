import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const path = resolve(
  process.cwd(),
  "supabase/migrations/20261103170500_v3_tg4_world_document_published_provision_guard.sql",
);
const migration = readFileSync(path, "utf8");

describe("Terra Solaris TG4 published provision immutability", () => {
  it("never permits a published/superseded Version row to be moved into a draft", () => {
    expect(migration).toContain("if tg_op in ('UPDATE', 'DELETE') then");
    expect(migration).toContain("where id = old.document_version_id");
    expect(migration).toContain("if v_old_state is distinct from 'draft' then");
    expect(migration).toContain("PUBLISHED_DOCUMENT_VERSION_IMMUTABLE");
  });

  it("also forbids inserting or moving draft provision content into an already published Version", () => {
    expect(migration).toContain("if tg_op in ('INSERT', 'UPDATE') then");
    expect(migration).toContain("where id = new.document_version_id");
    expect(migration).toContain("if v_new_state is distinct from 'draft' then");
  });

  it("retains the existing private trigger and registers an additive S13 contract", () => {
    expect(migration).toContain(
      "create or replace function private.world_document_version_provision_mutation_guard()",
    );
    expect(migration).not.toContain("drop trigger");
    expect(migration).toContain("set search_path = pg_catalog");
    expect(migration).toContain(
      "revoke all on function private.world_document_version_provision_mutation_guard()",
    );
    expect(migration).toContain("'v3.tg4.world-document-published-provision-guard'");
    expect(migration).toContain("public.v3_register_migration_contract");
  });
});

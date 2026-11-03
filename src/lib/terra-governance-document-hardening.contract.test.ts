import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { TERRA_GOVERNANCE_TG4_MIGRATIONS } from "./terra-governance-domain-registry";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = source(`supabase/migrations/${TERRA_GOVERNANCE_TG4_MIGRATIONS[3]}`);

describe("Terra Solaris Governance TG4 document hardening", () => {
  it("binds a draft's legal predecessor to the Work's current version", () => {
    expect(migration).toContain("private.world_document_draft_predecessor_guard");
    expect(migration).toContain("new.supersedes_version_id is distinct from v_current_version_id");
    expect(migration).toContain("DRAFT_PREDECESSOR_MISMATCH");
    expect(migration).toContain("v_version.supersedes_version_id is distinct from v_document.current_version_id");
  });

  it("makes stable provision identity immutable after creation", () => {
    expect(migration).toContain("private.world_document_provision_identity_guard");
    expect(migration).toContain("new.document_id is distinct from old.document_id");
    expect(migration).toContain("new.semantic_key is distinct from old.semantic_key");
    expect(migration).toContain("PROVISION_IDENTITY_IMMUTABLE");
  });

  it("blocks version-specific provision mutation once legal text is no longer draft", () => {
    expect(migration).toContain("private.world_document_version_provision_mutation_guard");
    expect(migration).toContain("v_state is distinct from 'draft'");
    expect(migration).toContain("PUBLISHED_DOCUMENT_VERSION_IMMUTABLE");
  });

  it("requires every version-specific parent to exist in the same historical version", () => {
    expect(migration).toContain("private.world_document_version_parent_presence_guard");
    expect(migration).toContain("parent_row.document_version_id = new.document_version_id");
    expect(migration).toContain("parent_row.provision_id = new.parent_provision_id");
    expect(migration).toContain("deferrable initially deferred");
    expect(migration).toContain("PROVISION_PARENT_NOT_IN_VERSION");
  });

  it("qualifies artifact RLS against the outer artifact row", () => {
    expect(migration).toContain("world_document_artifacts.status = 'ready'");
    expect(migration).toContain("version_row.id = world_document_artifacts.document_version_id");
  });

  it("replaces unsafe mixed-rowtype projection and draft lookups with exact rowtype queries", () => {
    expect(migration).toContain("select * into v_version\n  from public.world_document_versions");
    expect(migration).toContain("select document_row.* into v_document");
    expect(migration).toContain("select * into v_organization\n    from public.world_organizations");
    expect(migration).not.toContain("select version_row.*, document_row.organization_id\n  into v_version");
    expect(migration).not.toContain("select document_row.*, organization_row.*\n  into v_document, v_organization");
  });

  it("keeps hardening additive and migration-ledger adopted", () => {
    expect(migration).toContain("'v3.tg4.world-document-hardening'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("public.v3_register_migration_contract");
    expect(migration).not.toMatch(/drop table public\.world_/i);
  });
});

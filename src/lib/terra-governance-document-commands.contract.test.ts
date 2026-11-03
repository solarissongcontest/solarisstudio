import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { TERRA_GOVERNANCE_TG4_MIGRATIONS } from "./terra-governance-domain-registry";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = source(`supabase/migrations/${TERRA_GOVERNANCE_TG4_MIGRATIONS[1]}`);

describe("Terra Solaris Governance TG4 document commands", () => {
  it("exposes only authoritative generic document mutations", () => {
    expect(migration).toContain("public.world_create_document_v1");
    expect(migration).toContain("public.world_create_document_version_v1");
    expect(migration).toContain("public.world_update_document_version_draft_v1");
    expect(migration).toContain("public.world_publish_document_version_v1");
    expect(migration).not.toMatch(/guard_create|unity_create|guard_publish|unity_publish/i);
  });

  it("reuses the canonical V3 operation and receipt contract for idempotency", () => {
    expect(migration.match(/private\.studio2_claim_operation\(/g)?.length).toBeGreaterThanOrEqual(4);
    expect(migration.match(/public\.studio2_reconcile_operation\(/g)?.length).toBeGreaterThanOrEqual(8);
    expect(migration.match(/private\.studio2_complete_operation\(/g)?.length).toBeGreaterThanOrEqual(4);
    expect(migration).toContain("'world.document.create'");
    expect(migration).toContain("'world.document.version.create'");
    expect(migration).toContain("'world.document.version.update_draft'");
    expect(migration).toContain("'world.document.version.publish'");
  });

  it("binds draft and publication mutations to optimistic revisions", () => {
    expect(migration).toContain("p_expected_document_revision bigint");
    expect(migration).toContain("p_expected_version_revision bigint");
    expect(migration).toContain("message = 'VERSION_CONFLICT'");
    expect(migration).toContain("for update");
  });

  it("requires world-scoped capabilities rather than office-title checks", () => {
    expect(migration).toContain("public.world_access_allowed('world.document.manage'");
    expect(migration).toContain("public.world_access_allowed('world.document.publish'");
    expect(migration).not.toMatch(/role\s*=\s*['\"]chairperson/i);
    expect(migration).not.toMatch(/title\s*=\s*['\"]Chairperson/i);
  });

  it("resolves a durable delegation person for consequential authorship", () => {
    expect(migration).toContain("private.world_document_actor_person_v1");
    expect(migration).toContain("public.world_office_terms");
    expect(migration).toContain("public.world_country_control_terms");
    expect(migration).toContain("'actorPersonId'");
  });

  it("copies stable provisions forward without overwriting the source version", () => {
    expect(migration).toContain("p_source_version_id uuid");
    expect(migration).toContain("source_row.provision_id");
    expect(migration).toContain("source_row.parent_provision_id");
    expect(migration).not.toMatch(/update public\.world_document_versions[\s\S]{0,400}where id = p_source_version_id/);
  });

  it("validates provision payload uniqueness and hierarchy before publication", () => {
    expect(migration).toContain("private.world_document_validate_provision_payload");
    expect(migration).toContain("private.world_document_replace_draft_provisions");
    expect(migration).toContain("with recursive ancestry");
    expect(migration).toContain("where cycle limit 1");
  });

  it("treats publication as a fresh-auth R3 command with lost-response replay first", () => {
    const claim = migration.indexOf("'world.document.version.publish'");
    const replay = migration.indexOf("if coalesce((v_claim ->> 'replayed')::boolean, false)", claim);
    const freshAuth = migration.indexOf("private.studio2_require_fresh_auth(300)", claim);
    expect(claim).toBeGreaterThan(-1);
    expect(migration.slice(claim - 300, claim + 300)).toContain("'R3'");
    expect(replay).toBeGreaterThan(claim);
    expect(freshAuth).toBeGreaterThan(replay);
  });

  it("calculates a deterministic SHA-256 hash from canonical version and provision content", () => {
    expect(migration).toContain("extensions.digest(");
    expect(migration).toContain("'sha256'");
    expect(migration).toContain("'structuredContent', v_version.structured_content");
    expect(migration).toContain("'provisions', v_provisions");
  });

  it("atomically supersedes the prior current version without mutating legal substance", () => {
    expect(migration).toContain("publication_state = 'superseded'");
    expect(migration).toContain("superseded_by_version_id = p_version_id");
    expect(migration).toContain("record_class = 'permanent'");
    expect(migration).toContain("current_version_id = p_version_id");
  });

  it("emits the canonical semantic document events through the existing outbox", () => {
    for (const event of [
      "world.document.created",
      "world.document.version_created",
      "world.document.version_published",
      "world.document.version_superseded",
    ]) {
      expect(migration).toContain(`'${event}'`);
    }
    expect(migration).toContain("private.v3_emit_domain_event(");
    expect(migration).toContain("world.documents.archive");
    expect(migration).toContain("world.documents.search");
    expect(migration).toContain("world.documents.projection");
  });

  it("keeps canonical table DML unavailable to browser roles", () => {
    expect(migration).not.toMatch(/grant (insert|update|delete|all) on table[\s\S]* to authenticated/i);
    expect(migration).not.toMatch(/grant (insert|update|delete|all) on table[\s\S]* to anon/i);
  });

  it("registers command migration adoption immediately", () => {
    expect(migration).toContain("'v3.tg4.world-document-commands'");
    expect(migration).toContain("public.v3_register_migration_contract");
  });
});

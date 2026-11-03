import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { TERRA_GOVERNANCE_TG4_MIGRATIONS } from "./terra-governance-domain-registry";

const privacyMigration = "20261103171000_v3_tg4_world_document_provenance_privacy.sql";
const source = readFileSync(
  resolve(process.cwd(), "supabase/migrations", privacyMigration),
  "utf8",
);
const archive = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261103165500_v3_tg4_world_document_hardening.sql",
  ),
  "utf8",
);

describe("Terra Solaris TG4 legal-source provenance privacy", () => {
  it("limits raw public/member Version SELECT to non-privileged legal columns", () => {
    expect(source).toContain(
      "revoke select on table public.world_document_versions from anon, authenticated",
    );
    const grant = source.match(
      /grant select \(([^)]*)\) on table public\.world_document_versions to anon, authenticated;/,
    )?.[1];
    expect(grant).toBeDefined();
    expect(grant).toContain("structured_content");
    expect(grant).toContain("publication_state");
    expect(grant).not.toContain("source_description");
    expect(grant).not.toContain("source_provenance");
  });

  it("does not expose artifact storage references or provenance via raw browser SELECT", () => {
    expect(source).toContain(
      "revoke select on table public.world_document_artifacts from anon, authenticated",
    );
    const grant = source.match(
      /grant select \(([^)]*)\) on table public\.world_document_artifacts to anon, authenticated;/,
    )?.[1];
    expect(grant).toBeDefined();
    expect(grant).toContain("artifact_format");
    expect(grant).not.toContain("storage_reference");
    expect(grant).not.toContain("provenance");
  });

  it("preserves the existing manager-scoped source metadata in the bounded Archive projection", () => {
    expect(archive).toContain(
      "'sourceDescription', case when v_can_manage then version_row.source_description else null end",
    );
    expect(archive).toContain(
      "'sourceProvenance', case when v_can_manage then version_row.source_provenance else null end",
    );
  });

  it("registers the privilege narrowing in the canonical S13 ledger", () => {
    expect(TERRA_GOVERNANCE_TG4_MIGRATIONS.at(-1)).toBe(privacyMigration);
    expect(source).toContain("'v3.tg4.world-document-provenance-privacy'");
    expect(source).toContain("public.v3_register_migration_contract");
  });
});

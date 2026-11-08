import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261108115000_v3_tg4_world_legal_documents.sql",
  "utf8",
);

describe("TG4 legal archive authority boundary", () => {
  it("keeps legal truth in document and immutable version tables", () => {
    expect(migration).toContain("create table if not exists public.world_documents");
    expect(migration).toContain("create table if not exists public.world_document_versions");
    expect(migration).toContain("unique (document_id, version_number)");
    expect(migration).toContain("publication_state in ('draft', 'published', 'superseded', 'historical_source')");
  });

  it("does not grant direct browser access to document rows or full text", () => {
    expect(migration).toContain("revoke all on table public.world_documents, public.world_document_versions from public, anon, authenticated");
    expect(migration).not.toMatch(
      /grant select on table public\.world_documents, public\.world_document_versions to anon/i,
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("to_jsonb(version_row) - 'full_text'");
  });

  it("applies public organization and publication gates in every public projection", () => {
    expect(migration).toContain("organization_row.public_visibility = 'public'");
    expect(migration).toContain("organization_row.status in ('recognized', 'active', 'suspended', 'historical', 'dissolved')");
    expect(migration).toContain("document_row.visibility = 'public'");
    expect(migration).toContain("publication_state in ('published', 'superseded', 'historical_source')");
    expect(migration).toContain("world_document_publicly_available_v1(document_row.id)");
  });
});

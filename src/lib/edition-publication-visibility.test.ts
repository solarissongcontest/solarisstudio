import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = source("supabase/migrations/20260821195409_sync_edition_publication_from_shows.sql");
const editionsIndex = source("src/routes/editions/index.tsx");
const home = source("src/routes/index.tsx");

describe("edition publication visibility", () => {
  it("publishes an edition as soon as one of its shows is public, without requiring results", () => {
    expect(migration).toContain("where s.edition_id = v_new_edition");
    expect(migration).toContain("and s.published = true");
    expect(migration).toContain("published = exists");
    expect(migration).not.toContain("final_rank");
    expect(migration).not.toContain("public.results");
  });

  it("keeps edition visibility synchronized when show publication changes", () => {
    expect(migration).toContain("after insert or delete or update of published, edition_id, publication_config");
    expect(migration).toContain("shows_sync_edition_publication");
    expect(migration).toContain("sync_edition_publication_from_shows");
  });

  it("uses the edition published flag for both the edition library and newest-edition homepage", () => {
    expect(editionsIndex).toContain("filter((edition) => edition.published)");
    expect(home).toContain("filter((edition) => edition.published)");
  });
});

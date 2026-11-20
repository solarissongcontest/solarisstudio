import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261023211000_v3_jury_share_theme_backend.sql",
  ),
  "utf8",
);

describe("System V3 Jury Share Ready-version immutability", () => {
  it("forces edits after Ready through a new version instead of mutating official presentation history", () => {
    const start = migration.indexOf(
      "create or replace function private.v3_guard_archived_jury_share_theme()",
    );
    const end = migration.indexOf(
      "create or replace function public.v3_record_jury_share_theme_render_validation(",
      start,
    );
    const guard = migration.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(guard).toContain("old.state = 'ready'");
    expect(guard).toContain(
      "Ready Jury Share theme versions are immutable; create version + 1",
    );
    expect(guard).toContain("new.composition is distinct from old.composition");
    expect(guard).toContain(
      "new.composition_hash is distinct from old.composition_hash",
    );
    expect(guard).toContain("new.validation is distinct from old.validation");
  });

  it("permits only the controlled Ready to Archived transition without rewriting the frozen recipe", () => {
    const start = migration.indexOf(
      "create or replace function private.v3_guard_archived_jury_share_theme()",
    );
    const end = migration.indexOf(
      "create or replace function public.v3_record_jury_share_theme_render_validation(",
      start,
    );
    const guard = migration.slice(start, end);

    expect(guard).toContain("new.state <> 'archived'");
    expect(guard).toContain("new.edition_id is distinct from old.edition_id");
    expect(guard).toContain("new.version is distinct from old.version");
    expect(guard).toContain("new.activated_at is distinct from old.activated_at");
    expect(guard).toContain("Ready Jury Share theme versions must be versioned, not deleted");
  });

  it("keeps already archived versions fully immutable", () => {
    expect(migration).toContain("if old.state = 'archived' then");
    expect(migration).toContain("Archived Jury Share theme versions are immutable");
  });
});

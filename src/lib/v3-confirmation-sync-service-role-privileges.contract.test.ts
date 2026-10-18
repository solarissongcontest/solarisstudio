import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261018111500_v3_confirmation_sync_service_role_privileges.sql",
  ),
  "utf8",
);
const syncSource = readFileSync(
  resolve(process.cwd(), "src/integrations/confirmations/sync.functions.ts"),
  "utf8",
);

const directTables = [
  "submissions",
  "internal_entries",
  "national_finals",
  "national_final_entries",
  "editions",
  "countries",
  "entries",
  "contest_entities",
  "participants",
  "integration_links",
  "integration_events",
] as const;

const requiredPrivileges = [
  ["public.submissions", "SELECT"],
  ["public.internal_entries", "SELECT"],
  ["public.national_finals", "SELECT"],
  ["public.national_final_entries", "SELECT"],
  ["public.editions", "SELECT"],
  ["public.countries", "SELECT"],
  ["public.entries", "SELECT"],
  ["public.entries", "INSERT"],
  ["public.entries", "UPDATE"],
  ["public.participants", "SELECT"],
  ["public.participants", "INSERT"],
  ["public.participants", "UPDATE"],
  ["public.contest_entities", "SELECT"],
  ["public.contest_entities", "INSERT"],
  ["public.integration_links", "SELECT"],
  ["public.integration_links", "INSERT"],
  ["public.integration_links", "UPDATE"],
  ["public.integration_links", "DELETE"],
  ["public.integration_events", "INSERT"],
  ["public.integration_events", "UPDATE"],
] as const;

describe("System V3 canonical Confirmation sync service-role privileges", () => {
  it("covers every table directly accessed by the server synchronization path", () => {
    for (const table of directTables) {
      expect(syncSource).toContain(`.from("${table}")`);
      expect(migration).toContain(`public.${table}`);
    }
  });

  it("asserts every restored privilege during migration replay", () => {
    expect(migration).toContain("has_table_privilege(");
    for (const [table, privilege] of requiredPrivileges) {
      expect(migration).toContain(`('${table}', '${privilege}')`);
    }
    expect(migration).toContain(
      "Canonical Confirmation sync requires service_role % on %",
    );
  });

  it("keeps the repair least-privilege instead of granting broad table authority", () => {
    const normalized = migration.toLowerCase();
    expect(normalized).not.toContain("grant all");
    expect(normalized).not.toMatch(/grant[\s\S]*?\bto\s+anon\b/);
    expect(normalized).not.toMatch(/grant[\s\S]*?\bto\s+authenticated\b/);

    expect(normalized).toContain(
      "grant insert, update on table\n  public.integration_events\n  to service_role;",
    );
    expect(normalized).not.toContain(
      "grant select, insert, update on table\n  public.integration_events",
    );
  });

  it("is transactional so a failed privilege assertion cannot partially land", () => {
    expect(migration.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().toLowerCase().endsWith("commit;")).toBe(true);
  });
});

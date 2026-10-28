import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const foundationMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261018111500_v3_confirmation_sync_service_role_privileges.sql",
  ),
  "utf8",
);
const publicationEventFollowUp = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019000500_v3_confirmation_sync_publication_event_service_role.sql",
  ),
  "utf8",
);
const migration = `${foundationMigration}\n${publicationEventFollowUp}`;
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

function extractDirectTables(source: string) {
  return Array.from(
    new Set(
      [...source.matchAll(/\.from\(\s*["']([^"']+)["']\s*\)/g)].map(
        (match) => match[1],
      ),
    ),
  ).sort();
}

describe("System V3 canonical Confirmation sync service-role privileges", () => {
  it("retires raw Entry writes after the canonical command cutover", () => {
    const cutover=readFileSync(resolve(process.cwd(),"supabase/migrations/20261027211501_v3_s16_entry_confirmation_authority.sql"),"utf8");
    expect(cutover).toContain("revoke insert, update, delete on table public.entries");
    expect(cutover).toContain("from anon, authenticated, service_role");
    expect(cutover).toContain("grant execute on function public.v3_sync_confirmation_entry(uuid)");
    expect(syncSource).toContain('db.rpc("v3_sync_confirmation_entry"');
  });
  it("covers the complete table inventory directly accessed by the server synchronization path", () => {
    expect(extractDirectTables(syncSource)).toEqual([...directTables].sort());
    for (const table of directTables) {
      expect(foundationMigration).toContain(`public.${table}`);
    }
  });

  it("asserts every restored table privilege during migration replay", () => {
    expect(foundationMigration).toContain("has_table_privilege(");
    for (const [table, privilege] of requiredPrivileges) {
      expect(foundationMigration).toContain(`('${table}', '${privilege}')`);
    }
    expect(foundationMigration).toContain(
      "Canonical Confirmation sync requires service_role % on %",
    );
  });

  it("restores and asserts the server-only publication event boundary", () => {
    expect(syncSource).toContain('db.rpc("emit_entry_published_event"');
    expect(publicationEventFollowUp).toContain(
      "grant execute on function public.emit_entry_published_event(uuid, uuid)",
    );
    expect(publicationEventFollowUp).toContain("has_function_privilege(");
    expect(publicationEventFollowUp).toContain(
      "'public.emit_entry_published_event(uuid,uuid)'",
    );
    expect(publicationEventFollowUp).toContain(
      "Canonical Confirmation sync requires service_role EXECUTE on public.emit_entry_published_event(uuid,uuid)",
    );
    expect(publicationEventFollowUp).toContain(
      "Confirmation publication event boundary must not be executable by anon",
    );
    expect(publicationEventFollowUp).toContain(
      "Confirmation publication event boundary must not be executable by authenticated",
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

  it("keeps both ACL migrations transactional", () => {
    for (const sql of [foundationMigration, publicationEventFollowUp]) {
      expect(sql.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
      expect(sql.trimEnd().toLowerCase().endsWith("commit;")).toBe(true);
    }
  });
});

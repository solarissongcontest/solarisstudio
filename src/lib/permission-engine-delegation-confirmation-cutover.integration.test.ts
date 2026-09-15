import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrations = readdirSync(resolve(process.cwd(), "supabase/migrations"));
const migrationName = migrations.find((name) =>
  name.endsWith("_permission_engine_v2_delegation_confirmation_rls.sql"),
);

if (!migrationName) {
  throw new Error("Permission Engine delegation/confirmation cutover migration is missing");
}

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8",
);

function policyBlock(name: string) {
  const start = migration.indexOf(`create policy "${name}"`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = migration.indexOf("create policy", start + 1);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("Permission Engine delegation + confirmation RLS cutover", () => {
  it("keeps country-owner access while replacing Organizer checks", () => {
    for (const policy of [
      "country media owner or capability write",
      "country sections owner or capability write",
      "country profiles owner or capability write",
      "country themes owner or capability write",
    ]) {
      const block = policyBlock(policy);
      expect(block).toContain("public.owns_country(country_id)");
      expect(block).toContain("'delegation.manage'");
      expect(block).toContain("true");
      expect(block).not.toContain("has_role");
    }
  });

  it("keeps HOD claim self access independent from Organizer capabilities", () => {
    const read = policyBlock("country hod claims self or capability read");
    expect(read).toContain("user_id = (select auth.uid())");
    expect(read).toContain("'delegation.read'");
    expect(read).toContain("edition_id");
    expect(read).not.toContain("has_role");

    const write = policyBlock("country hod claims self or capability write");
    expect(write).toContain("user_id = (select auth.uid())");
    expect(write).toContain("'delegation.manage'");
    expect(write).toContain("edition_id");
    expect(write).toContain("true");
    expect(write).not.toContain("has_role");
  });

  it("uses edition-scoped delegation reads for historical identities", () => {
    const block = policyBlock("owners or capability read historical identities");
    expect(block).toContain("public.owns_country(country_id)");
    expect(block).toContain("'delegation.read'");
    expect(block).toContain("edition_id");
    expect(block).not.toContain("has_role");
  });

  it("moves global country administration to strict delegation.manage", () => {
    for (const policy of [
      "countries capability write",
      "country accounts capability manage",
    ]) {
      const block = policyBlock(policy);
      expect(block).toContain("'delegation.manage', null, true");
      expect(block).not.toContain("has_role");
    }
  });

  it("moves direct-edition confirmation writes to strict confirmation.manage", () => {
    for (const policy of [
      "next in line responses capability manage",
      "next in line submissions capability manage",
      "submission rounds capability manage",
      "submissions capability manage",
    ]) {
      const block = policyBlock(policy);
      expect(block).toContain("'confirmation.manage', edition_id, true");
      expect(block).not.toContain("has_role");
    }
  });

  it("leaves parent-scoped child tables for an independently rehearsed batch", () => {
    expect(migration).not.toContain("submission_browser_sessions_organizer_all");
    expect(migration).not.toContain("submission_drafts_organizer_all");
    expect(migration).not.toContain("submission_ip_history_organizer_all");
    expect(migration).not.toContain("submission_review_history_organizer_all");
    expect(migration).not.toContain("submission_versions_organizer_all");
    expect(migration).not.toContain("national_final_entries_organizer_all");
    expect(migration).not.toContain("national_finals_organizer_all");
  });
});

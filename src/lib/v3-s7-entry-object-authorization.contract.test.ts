import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20261016070000_v3_s7_entry_object_authorization.sql"), "utf8");
const rehearsal = readFileSync(resolve(process.cwd(), ".github/scripts/v3-s7-entry-object-authorization-rehearsal.sh"), "utf8");
const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/v3-s7-entry-object-authorization-rehearsal.yml"), "utf8");

describe("System V3 S7 Entry object authorization", () => {
  it("resolves participant edition + country before mutation", () => {
    expect(migration).toContain("private.v3_resolve_country_entry_target_edition");
    expect(migration).toContain("participant.id = p_participant_id");
    expect(migration).toContain("participant.country_id = p_country_id");
    expect(migration).toContain("v_target_edition_id is distinct from p_claimed_edition_id");
    expect(migration).toContain("Entry does not belong to the authorized edition");
  });

  it("protects Organizer and country-owner entry/link wrappers", () => {
    for (const name of [
      "public.admin_upsert_country_entry",
      "public.admin_update_country_entry_listen_links",
      "public.upsert_owned_country_entry",
      "public.update_owned_country_entry_listen_links",
    ]) {
      const start = migration.indexOf(`create or replace function ${name}`);
      expect(start).toBeGreaterThanOrEqual(0);
      const next = migration.indexOf("create or replace function", start + 30);
      const fn = migration.slice(start, next === -1 ? migration.length : next);
      expect(fn).toContain("private.v3_resolve_country_entry_target_edition");
    }
    expect(migration).toContain("studio2_access_allowed('entry.edit', v_edition_id, true)");
  });

  it("keeps resolver private", () => {
    expect(migration).toContain("from public, anon, authenticated;");
  });

  it("rehearses hostile IDs on isolated clean and upgrade databases", () => {
    expect(rehearsal).toContain("Organizer A cannot target participant B");
    expect(rehearsal).toContain("country owner cannot smuggle participant B through Edition A");
    expect(rehearsal).toContain("wrong country is rejected");
    expect(rehearsal).toContain("matching Edition B capability succeeds");
    expect(workflow).toContain("supabase db reset --local --no-seed");
    expect(workflow).toContain("supabase migration up --local --include-all");
    expect(workflow).not.toMatch(/supabase\.co/i);
  });
});

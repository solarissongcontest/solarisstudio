import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("country edition participation editing", () => {
  it("renders one editable entry per edition rather than one per show appearance", () => {
    const hub = source("src/routes/_authenticated/country-hub/index.tsx");

    expect(hub).toContain("const byEdition = new Map<string, EditionEntry>()");
    expect(hub).toContain("byEdition.get(entry.edition_id)");
    expect(hub).toContain("key={group.editionId}");
    expect(hub).not.toContain("myEntries.map((entry) => <EntryEditor key={entry.id}");
    expect(hub).toContain("These are appearances of the same edition entry. Artist, song and listening links are entered once.");
  });

  it("keeps edition-wide artist and song synchronization in the database", () => {
    const canonical = source("supabase/migrations/20260818195904_canonical_edition_participations.sql");
    const ownership = source("supabase/migrations/20260811191000_organizer_country_ownership_and_moderation.sql");

    expect(canonical).toContain("A participant row is a show appearance");
    expect(canonical).toContain("edition + country/custom-entity identity");
    expect(canonical).toContain("participants_sync_entry_details");
    expect(ownership).toContain("where p.edition_id = v_target_edition_id");
    expect(ownership).toContain("set artist = v_artist");
    expect(ownership).toContain("song = v_song");
  });

  it("restores the organizer country-account directory instead of treating missing RPCs as zero claims", () => {
    const repair = source("supabase/migrations/20260819191000_restore_country_account_admin_rpcs.sql");

    expect(repair).toContain("create or replace function public.admin_country_accounts()");
    expect(repair).toContain("from public.country_accounts ca");
    expect(repair).toContain("create or replace function public.admin_set_country_account_status");
    expect(repair).toContain("Organizer access required");
  });
});
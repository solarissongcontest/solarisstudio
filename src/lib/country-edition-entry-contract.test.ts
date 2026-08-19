import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const accountSource = source("src/lib/country-account.ts");
const countryHubSource = source("src/routes/_authenticated/country-hub/index.tsx");
const countryAdminSource = source("src/routes/_authenticated/admin/country-accounts.tsx");
const appShellSource = source("src/components/AppShell.tsx");
const migrationSource = source("supabase/migrations/20260819203000_country_edition_entry_contract.sql");

describe("country HOD edition entry contract", () => {
  it("saves one artist and song by edition, not by show appearance", () => {
    expect(accountSource).toContain('"upsert_owned_country_edition_entry"');
    expect(accountSource).toContain('"admin_upsert_country_edition_entry"');
    expect(accountSource).not.toContain("_show_id: input.showId");
    expect(accountSource).not.toContain("_participant_id: input.participantId");
    expect(countryHubSource).not.toContain("First show appearance");
    expect(countryHubSource).not.toContain("showId: addEntry");
    expect(countryHubSource).toContain("Show assignments are managed by organizers elsewhere");
  });

  it("keeps show rows as appearances while the database write is country + edition scoped", () => {
    expect(migrationSource).toContain("show-specific participant rows as appearances");
    expect(migrationSource).toContain("where p.edition_id = _edition_id");
    expect(migrationSource).toContain("and p.country_id = v_country_id");
    expect(migrationSource).toContain("and p.country_id = _country_id");
    expect(migrationSource).not.toMatch(/create or replace function public\.upsert_owned_country_edition_entry\([\s\S]*?_show_id/);
  });

  it("creates only a showless edition participation when history is missing", () => {
    expect(migrationSource).toContain("participants_one_showless_country_entry_per_edition");
    expect(migrationSource).toContain("show_id is null and country_id is not null");
    expect(migrationSource).toContain("null,\n      'confirmed'");
  });
});

describe("country ownership admin", () => {
  it("falls back to organizer-protected country_accounts reads instead of treating an RPC failure as zero claims", () => {
    expect(accountSource).toContain("loadAdminCountryAccountsFallback");
    expect(accountSource).toContain('.from("country_accounts")');
    expect(accountSource).toContain("if (!rpc.error && rpcAccounts.length > 0)");
    expect(countryAdminSource).toContain("Solaris will not assume that means nobody has claimed a country.");
    expect(countryAdminSource).toContain("claimed countr");
  });

  it("does not show zero while the claim query is still unresolved", () => {
    expect(countryAdminSource).toContain('value={isLoading ? "…"');
    expect(countryAdminSource).toContain("Country ownership could not be loaded.");
    expect(countryAdminSource).toContain("Retry");
  });
});

describe("unified My Solaris navigation", () => {
  it("does not create duplicate My country / Country setup account destinations", () => {
    expect(appShellSource).toContain("Profile, activity and country workspace");
    expect(appShellSource).not.toContain('label: "My country"');
    expect(appShellSource).not.toContain('label: "Country setup"');
  });
});

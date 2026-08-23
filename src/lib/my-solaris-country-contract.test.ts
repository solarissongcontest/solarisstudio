import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const account = source("src/lib/country-account.ts");
const hub = source("src/routes/_authenticated/country-hub/index.tsx");
const shell = source("src/components/AppShell.tsx");
const appearance = source("src/routes/_authenticated/country-hub/theme.tsx");
const builder = source("src/routes/_authenticated/country-hub/page-builder.tsx");
const entryMigration = source("supabase/migrations/20260819212500_edition_level_country_entries.sql");
const cleanRpcMigration = source("supabase/migrations/20260819215500_clean_edition_entry_rpcs.sql");
const appearanceCountMigration = source("supabase/migrations/20260820123000_fix_edition_participation_appearance_count.sql");

describe("edition-wide country entries", () => {
  it("gives HODs an edition-only database contract", () => {
    expect(account).toContain('"upsert_owned_country_edition_entry"');
    expect(account).toContain('"admin_upsert_country_edition_entry"');
    expect(account).not.toContain("_show_id: input.showId");
    expect(account).not.toContain("_participant_id: input.participantId");
    expect(cleanRpcMigration).not.toContain("_show_id uuid");
    expect(cleanRpcMigration).not.toContain("_participant_id uuid");
  });

  it("keeps semi-final/final rows as appearances of one canonical edition entry", () => {
    expect(entryMigration).toContain("show_id = null row is the canonical edition entry edited by the HoD");
    expect(entryMigration).toContain("never their\n  -- own artist/song identity");
    expect(hub).not.toContain("First show appearance");
    expect(hub).toContain("Reaching the final does not create a second participation");
    expect(hub).toContain("Edit once per edition:");
  });

  it("does not count the canonical edition row as a show appearance", () => {
    expect(appearanceCountMigration).toContain("count(*) filter (where p.show_id is not null)");
    expect(appearanceCountMigration).toContain("array_agg(p.show_id");
    expect(appearanceCountMigration).toContain("filter (where p.show_id is not null) as show_ids");
  });
});

describe("country claims and unified account workspace", () => {
  it("does not silently convert an empty/broken admin RPC into zero real claims", () => {
    expect(account).toContain("loadAdminCountryAccountsFallback");
    expect(account).toContain('.from("country_accounts")');
    expect(account).toContain("if (!rpc.error && rpcAccounts.length > 0)");
  });

  it("has one MySolaris destination instead of duplicate profile/country destinations", () => {
    expect(shell).toContain("Open MySolaris");
    expect(shell).toContain("MySolaris dashboard");
    expect(shell).not.toContain('label: "My country"');
    expect(shell).not.toContain('label: "Country setup"');
    expect(shell).not.toContain('>Profile & activity<');
  });

  it("does not expose the internal no-email auth address in navigation", () => {
    expect(shell).toContain('@country.solaris.invalid');
    expect(shell).toContain('visibleAccountEmail ?? "Country account"');
  });

  it("keeps the country workspace focused instead of rendering every editor at once", () => {
    expect(hub).toContain('type HubTab = "overview" | "country" | "page" | "entries"');
    expect(hub).toContain('label: "Overview"');
    expect(hub).toContain('label: "Country"');
    expect(hub).toContain('label: "Page & media"');
    expect(hub).toContain('label: "Entries"');
    expect(hub).toContain('activeTab === "overview"');
    expect(hub).toContain('activeTab === "country"');
    expect(hub).toContain('activeTab === "page"');
    expect(hub).toContain('activeTab === "entries"');
    expect(hub).toContain("Choose what you want to work on instead of scrolling through everything at once.");
  });
});

describe("country page customization", () => {
  it("keeps full background customization and image guidance", () => {
    expect(appearance).toContain("1920×1080");
    expect(appearance).toContain("2560×1440");
    expect(appearance).toContain('backgroundMode === "image"');
    expect(appearance).toContain('backgroundMode === "gradient"');
    expect(appearance).toContain("Gradient style");
    expect(appearance).toContain("Dark overlay");
    expect(appearance).toContain("Background blur");
  });

  it("keeps modular country/wiki blocks, editable generated writing, visibility and ordering controls", () => {
    expect(builder).toContain("visibleOnCountry");
    expect(builder).toContain("visibleOnWiki");
    expect(builder).toContain("contentMode");
    expect(builder).toContain("imageLayout");
    expect(builder).toContain("useReorderCountryPageSections");
    expect(builder).toContain("System-assisted writing");
    expect(builder).toContain("Fact source");
    expect(builder).toContain("Custom facts");
  });
});

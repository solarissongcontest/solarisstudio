import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("V3 Search cutover", () => {
  const flags = () => source("src/lib/feature-flags.ts");
  const surfaces = () => source("src/lib/studio2-product-surfaces.ts");
  const migration = () => source("supabase/migrations/20261013140000_v3_search_cutover.sql");
  const rollout = () => source("src/integrations/v3/rollout-probe.server.ts");
  const shell = () => source("src/components/v3/V3AppShell.tsx");
  const palette = () => source("src/components/public/PublicCommandPalette.tsx");
  const exploreGate = () => source("src/components/v3/V3ExploreRouteGate.tsx");
  const editionGate = () => source("src/components/v3/V3EditionRouteGate.tsx");

  it("registers an independent disabled-by-default Search rollout slice", () => {
    expect(flags()).toContain("'solaris_app_v3_search'");
    expect(surfaces()).toContain('key: "solaris_app_v3_search"');
    expect(surfaces()).toContain('dependsOn: ["solaris_app_v3"]');
    expect(migration()).toContain("'solaris_app_v3_search'");
    expect(migration()).toMatch(/'solaris_app_v3_search',\s*false,/);
  });

  it("keeps rollout authority on the server and fails Search closed with global V3", () => {
    expect(rollout()).toContain("searchEnabled: boolean");
    expect(rollout()).toContain('p_key: "solaris_app_v3_search"');
    expect(rollout()).toContain("const searchEnabled = enabled && !searchFlag.error && searchFlag.data === true");
    expect(rollout()).toContain("searchEnabled: false");
    expect(rollout()).not.toMatch(/localStorage|sessionStorage|VITE_.*SEARCH/i);
  });

  it("reuses one canonical installed-app Search owner in the V3 shell", () => {
    expect(shell()).toContain('rollout.data?.searchEnabled === true');
    expect(shell()).toContain("<PublicCommandPalette compact />");
    expect(shell()).toContain('data-v3-search-entry=""');
    expect(shell()).toContain('data-v3-search-owner="canonical"');
    expect(palette()).toContain('rpc("solaris_public_search"');
    expect(palette()).toContain("rememberAppSearchReturn");
    expect(palette()).toContain("readPendingAppSearchRestore");
    expect(palette()).toContain('contentLayout="fullscreen"');
  });

  it("does not create duplicate Search owners on migrated Explore and Edition screens", () => {
    expect(exploreGate()).toContain("globalSearchEnabled");
    expect(exploreGate()).toContain("!globalSearchEnabled ? (");
    expect(exploreGate()).toContain('[data-v3-search-owner="canonical"]');
    expect(editionGate()).toContain("globalSearchEnabled");
    expect(editionGate()).toContain("!globalSearchEnabled ? (");
  });

  it("delegates entry disclosure to the canonical public participant projection", () => {
    const sql = migration();
    expect(sql).toContain("public.public_safe_participants(null, null)");
    expect(sql).toContain("safe_participant_rows");
    expect(sql).toContain("safe_entries");
    expect(sql).not.toMatch(/from\s+public\.participants\b/i);
    expect(sql).not.toMatch(/from\s+public\.results\b/i);
    expect(sql).not.toMatch(/from\s+public\.jury/i);
    expect(sql).not.toMatch(/from\s+public\.televot/i);
  });

  it("keeps Search bounded and non-polling", () => {
    const installedSearch = palette().slice(
      palette().indexOf("function AppPublicPaletteDialog"),
      palette().indexOf("function WebPublicPaletteDialog"),
    );
    expect(installedSearch).toContain('result_limit: 30');
    expect(installedSearch).toContain("normalized.length >= 2");
    expect(installedSearch).not.toContain("refetchInterval");
    expect(installedSearch).not.toContain("useAllParticipants");
    expect(installedSearch).not.toContain("useAllResults");
    expect(installedSearch).not.toContain("useAllJuryVotes");
  });
});

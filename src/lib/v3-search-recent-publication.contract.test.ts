import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/public/PublicCommandPalette.tsx"),
  "utf8",
);
const recentGuard = source.slice(
  source.indexOf("function publicRecentShowIds("),
  source.indexOf("function AppPublicPaletteDialog("),
);

describe("Global Search stored Show publication boundary", () => {
  it("revalidates only bounded recent Show identities, never the full archive at idle", () => {
    expect(recentGuard).toContain('queryKey: ["public-command-palette-recent-show-visibility", showIds]');
    expect(recentGuard).toContain("enabled: showIds.length > 0");
    expect(recentGuard).toContain('.select("id,edition_id,published,publication_config")');
    expect(recentGuard).toContain('.in("id", showIds)');
    expect(recentGuard).toContain(".filter(isRecentShowPublic)");
    expect(recentGuard).toContain('.select("id,published")');
    expect(recentGuard).toContain("edition.published === true");
    expect(recentGuard).toContain("visibleRecentShowDestinations(");
    expect(recentGuard).not.toContain("useAllShows()");
    expect(recentGuard).not.toContain("useAllResults()");
    expect(recentGuard).not.toContain("useAllJuryVotes()");
  });

  it("does not leak a cached Show label while fresh publication verification is pending or failed", () => {
    expect(recentGuard).toContain('refetchOnMount: "always"');
    expect(recentGuard).toContain("staleTime: 0");
    expect(recentGuard).toContain("retry: false");
    expect(recentGuard).toContain("showVisibility.isSuccess");
    expect(recentGuard).toContain("showVisibility.isFetchedAfterMount");
    expect(recentGuard).toContain("!showVisibility.isFetching");
    expect(recentGuard).toContain("if (error) throw error");
    expect(recentGuard).toContain("if (editionError) throw editionError");
  });

  it("filters both installed Search and browser Search recents through the same guard", () => {
    expect(source.match(/const visibleRecents = usePublicationSafeRecents\(\);/g)).toHaveLength(2);
    expect(source).not.toContain("readPublicRecents().slice(0, 8).map(");
    expect(source).not.toContain("readPublicRecents().map(");
    expect(source).toContain("<WebSearchArchiveResults");
  });
});

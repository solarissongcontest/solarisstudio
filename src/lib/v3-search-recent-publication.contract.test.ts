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

describe("Global Search Edition and Story publication boundary", () => {
  it("never scans whole archives just to verify saved labels", () => {
    expect(recentGuard).toContain("recentPublicationSlugs(recents)");
    expect(recentGuard).toContain("enabled: editionSlugs.length > 0");
    expect(recentGuard).toContain("enabled: storySlugs.length > 0");
    expect(recentGuard).toContain('.select("slug,published")');
    expect(recentGuard).toContain('.in("slug", editionSlugs)');
    expect(recentGuard).toContain("storySlugs.map((slug) => loadPublicStoryline(slug))");
    expect(recentGuard).not.toContain("loadPublicStorylines(");
    expect(recentGuard).not.toContain('.from("studio2_storylines")');
    expect(recentGuard).not.toContain("useAllParticipants()");
  });

  it("fails closed when a Story is unpublished, malformed or cannot be verified", () => {
    expect(recentGuard).toContain("Promise.allSettled(");
    expect(recentGuard).toContain('result.status === "fulfilled"');
    expect(recentGuard).toContain("result.value?.editionSlug === storySlugs[index]");
    expect(recentGuard).toContain("storyVisibility.isSuccess");
    expect(recentGuard).toContain("storyVisibility.isFetchedAfterMount");
    expect(recentGuard).toContain("!storyVisibility.isFetching");
  });

  it("requires a fresh Edition and Story check on every palette open", () => {
    expect(recentGuard).toContain("editionVisibility.isSuccess");
    expect(recentGuard).toContain("editionVisibility.isFetchedAfterMount");
    expect(recentGuard).toContain("!editionVisibility.isFetching");
    expect(recentGuard.match(/refetchOnMount: "always"/g)).toHaveLength(3);
    expect(recentGuard).toContain("visibleRecentShowDestinations(recents, allowedShows)");
    expect(recentGuard).toContain("visiblePublicationVerifiedRecents(");
    expect(recentGuard).toContain("publishedEditionSlugs: new Set(allowedEditionSlugs)");
    expect(recentGuard).toContain("publishedStorySlugs: new Set(allowedStorySlugs)");
  });
});

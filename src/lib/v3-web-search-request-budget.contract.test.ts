import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/public/PublicCommandPalette.tsx"),
  "utf8",
);

function section(start: string, end: string) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

describe("V3 web global Search request budget", () => {
  it("does not mount archive-wide Search providers while the web palette is idle", () => {
    const web = section("function WebPublicPaletteDialog", "function WebSearchArchiveResults");

    expect(web).toContain("useCountries()");
    expect(web).toContain("useEditions()");
    expect(web).toContain("{normalized ? (");
    expect(web).toContain("<WebSearchArchiveResults");
    expect(web).not.toContain("useAllShows()");
    expect(web).not.toContain("useAllParticipants()");
    expect(web).not.toContain("useAllResults()");
    expect(web).not.toContain("useAllJuryVotes()");
    expect(web).not.toContain("loadPublicStorylines(40)");
  });

  it("mounts the retained archive providers only inside the non-empty-query child", () => {
    const archive = section("function WebSearchArchiveResults", "function renderSearchGroups");

    expect(archive).toContain("useAllShows()");
    expect(archive).toContain("useAllParticipants()");
    expect(archive).toContain("useAllResults()");
    expect(archive).toContain("useAllJuryVotes()");
    expect(archive).toContain("loadPublicStorylines(40)");
  });

  it("preserves record, scorechart, entry and story search providers", () => {
    const archive = section("function WebSearchArchiveResults", "function renderSearchGroups");

    expect(archive).toContain("buildCanonicalFanRecords");
    expect(archive).toContain('group: "Records"');
    expect(archive).toContain('group: "Scorecharts"');
    expect(archive).toContain('group: "Entries"');
    expect(archive).toContain('group: "Stories"');
    expect(archive).toContain("searchGovernanceLibrary(normalized)");
    expect(archive).toContain("navigationSearchResults(normalized)");
  });

  it("preserves idle current-edition, country, confirmation and recent actions", () => {
    const web = section("function WebPublicPaletteDialog", "function WebSearchArchiveResults");

    expect(web).toContain('id: "action:current-edition"');
    expect(web).toContain('id: "action:my-country"');
    expect(web).toContain('id: "action:confirmation"');
    expect(web).toContain("readPublicRecents()");
  });

  it("does not alter installed-app Search authority", () => {
    const app = section("function AppPublicPaletteDialog", "function WebPublicPaletteDialog");

    expect(app).toContain('rpc("solaris_public_search"');
    expect(app).toContain("rememberAppSearchReturn");
    expect(app).toContain("readAppSearchState");
  });
});

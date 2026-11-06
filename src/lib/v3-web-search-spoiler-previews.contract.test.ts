import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const palette = readFileSync(
  resolve(process.cwd(), "src/components/public/PublicCommandPalette.tsx"),
  "utf8",
);
const web = palette.slice(
  palette.indexOf("function WebSearchArchiveResults"),
  palette.indexOf("function renderSearchGroups"),
);

describe("V3 global Search spoiler-safe web previews", () => {
  it("uses the local spoiler-free preference without adding hosted preference requests", () => {
    expect(web).toContain("useAppExperiencePreferences()");
    expect(web).toContain("resolvePublicSearchSpoilerPreviewScope({");
    expect(web).toContain("spoilerFree: preferences.spoilerFree");
    expect(web).not.toContain("useNotificationPreferences(");
  });

  it("hides current final record inputs, not the published entity navigation", () => {
    expect(web).toContain("const spoilerSafeRecordArchive = useMemo(");
    for (const field of ["editions", "shows", "participants", "results", "jury"]) {
      expect(web).toContain(`${field}: excludeSearchSpoilerEdition(`);
    }
    expect(web).toContain("...spoilerSafeRecordArchive,");
    expect(web).toContain("...publicShows");
    expect(web).toContain("...publicEditions");
    expect(web).toContain("...searchableEntries");
    expect(web).toContain('group: "Records"');
    expect(web).toContain('group: "Scorecharts"');
  });

  it("excludes current edition Story headlines without breaking published story routes", () => {
    expect(web).toContain("excludeSearchSpoilerStories(");
    expect(web).toContain("spoilerScope.editionSlug");
    expect(web).toContain('href: `/stories/${story.editionSlug}`');
    expect(web).toContain("storiesQuery.isError ? [] : storiesQuery.data ?? []");
  });

  it("shows a spoiler-mode explanation while leaving canonical route navigation available", () => {
    expect(web).toContain("spoilerScope.editionId ? (");
    expect(web).toContain("Spoiler-free mode hides current-edition story and record previews.");
    expect(web).toContain("renderSearchGroups(grouped, openResult)");
    expect(web).toContain('href: "/records"');
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/integrations/v3/explore-source.server.ts"), "utf8");

describe("V3 Explore bounded archive publication reads", () => {
  it("does not download unused historical Edition text, theme or host-country fields", () => {
    const implementation = source();
    expect(implementation).toContain(
      'const EDITION_COLUMNS =\\n  "id,edition_number,name,year,slug,host_city,logo,artwork_url,status,published";',
    );
    expect(implementation).not.toContain("description,host_country_id");
    expect(implementation).not.toContain("host_country_id,host_city");
    expect(implementation).not.toContain("theme_id");
  });

  it("keeps current Show Mode data separate from narrow historical result gates", () => {
    const implementation = source();
    expect(implementation).toContain('const CURRENT_SHOW_COLUMNS =');
    expect(implementation).toContain('.select(CURRENT_SHOW_COLUMNS)');
    expect(implementation).toContain('.eq("edition_id", currentEdition.id)');
    expect(implementation).toContain('const ARCHIVE_RESULT_SHOW_COLUMNS =');
    expect(implementation).toContain('.select(ARCHIVE_RESULT_SHOW_COLUMNS)');
    expect(implementation).toContain('.in("kind", ["grand-final", "final"])');
    expect(implementation).toContain('.in("edition_id", projectionEditionIds)');
    expect(implementation).not.toContain('const SHOW_COLUMNS =');
  });

  it("queries rank-1 result identity only, never detailed vote totals for Explore previews", () => {
    const implementation = source();
    expect(implementation).toContain('const WINNER_RESULT_COLUMNS = "edition_id,show_id,final_rank";');
    expect(implementation).toContain('.select(WINNER_RESULT_COLUMNS)');
    expect(implementation).toContain('.eq("final_rank", 1)');
    expect(implementation).not.toContain("jury_points,televote_points,total_points");
    expect(implementation).not.toContain('.from("participants")');
    expect(implementation).not.toContain("jury_votes");
    expect(implementation).not.toContain("televotes");
  });

  it("preserves official publication gating and server-owned event chronology", () => {
    const implementation = source();
    expect(implementation).toContain("resolveShowPublication(show).results");
    expect(implementation).toContain("resolvePublicEditionState({");
    expect(implementation).toContain("const resultShows = resultShowsForEdition(edition.id)");
    expect(implementation).toContain("resultsPublished: finalResultsPublished(resultShows, editionWinners)");
    expect(implementation).toContain("resolveV3ExploreNextPublicEvent(currentShows, generatedAt)");
    expect(implementation).toContain("const projectionEditionIds = projectionEditions.map");
  });
});

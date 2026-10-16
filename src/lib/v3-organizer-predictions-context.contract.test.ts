import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/predictions.tsx", "utf8");
const boundedReader = readFileSync("src/lib/v3-organizer-prediction-data.ts", "utf8");
const legacyData = readFileSync("src/lib/prediction-data.ts", "utf8");

describe("V3 Organizer Prediction Arena context", () => {
  it("uses only the explicitly selected Organizer edition", () => {
    expect(route).toContain("editions.find((edition) => edition.id === editionId) ?? null");
    expect(route).not.toContain("useAllShows");
    expect(route).toContain("useShows(activeEdition?.id)");
    expect(route).not.toContain("ordered[0]");
    expect(route).not.toContain("[...editions].sort");
    expect(route).toContain("will not substitute the newest or globally active edition");
  });

  it("bounds prediction-round reads to the selected edition's show ids", () => {
    expect(route).toContain("useOrganizerPredictionRoundsForShows(showIds, true)");
    expect(boundedReader).toContain("normalizedShowIds.length > 0");
    expect(boundedReader).toContain('.in("show_id", normalizedShowIds)');
    expect(boundedReader).toContain('"organizer-shows"');
    expect(boundedReader).not.toContain('showId ?? "all"');
  });

  it("clears stale UI state and rejects commands after edition drift", () => {
    expect(route).toContain("setForm(defaultForm())");
    expect(route).toContain("setDeleteOpen(false)");
    expect(route).toContain("activeEdition.id !== editionId");
    expect(route).toContain("selectedShow.edition_id !== activeEdition.id");
    expect(route).toContain("selectedRound.show_id !== selectedShow.id");
    expect(route).toContain("Edition context changed before the Prediction Arena command");
    expect(route).toContain("assertExactSelection()");
  });

  it("keeps legacy mutation authority visible until System replaces it", () => {
    expect(legacyData).toContain('.from("prediction_rounds")');
    expect(legacyData).toContain(".upsert(");
    expect(legacyData).toContain(".delete().eq(\"id\", roundId)");
    expect(legacyData).toContain('rpc("score_prediction_round"');
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const gate = () => source("src/components/v3/V3EditionRouteGate.tsx");
const overview = () => source("src/components/v3/V3EditionOverviewScreen.tsx");
const participants = () => source("src/components/v3/V3EditionParticipantsScreen.tsx");
const songs = () => source("src/components/v3/V3EditionSongsScreen.tsx");
const schedule = () => source("src/components/v3/V3EditionScheduleScreen.tsx");
const viewContract = () => source("src/lib/v3-edition-view.ts");

describe("V3 Edition bounded product architecture", () => {
  it("routes overview and each full collection through deliberate product surfaces", () => {
    const gateSource = gate();
    expect(gateSource).toContain("resolveV3EditionCollectionView(searchStr)");
    expect(gateSource).toContain('editionView === "participants"');
    expect(gateSource).toContain("<V3EditionParticipantsScreen");
    expect(gateSource).toContain('editionView === "songs"');
    expect(gateSource).toContain("<V3EditionSongsScreen");
    expect(gateSource).toContain('editionView === "schedule"');
    expect(gateSource).toContain("<V3EditionScheduleScreen");
    expect(gateSource).toContain("<V3EditionOverviewScreen");
    expect(gateSource).not.toContain("<V3EditionProductScreen");
    expect(gateSource).toContain("projection={bundle.projection}");
  });

  it("keeps Overview previews within explicit content budgets", () => {
    const screenSource = overview();
    expect(screenSource).toContain("V3_EDITION_OVERVIEW_LIMITS.participants");
    expect(screenSource).toContain("V3_EDITION_OVERVIEW_LIMITS.songs");
    expect(screenSource).toContain("V3_EDITION_OVERVIEW_LIMITS.schedule");
    expect(screenSource).toContain("V3_EDITION_OVERVIEW_LIMITS.storyItems");
    expect(screenSource).toContain("V3_EDITION_OVERVIEW_LIMITS.resultRows");
    expect(screenSource).toContain("participantPreview.map");
    expect(screenSource).toContain("entryPreview.map");
    expect(screenSource).toContain("showPreview.map");
    expect(screenSource).toContain("storyPreview.map");
    expect(screenSource).toContain("resultPreview.map");
    expect(screenSource).toContain('data-v3-flag-ratio="3:2"');
  });

  it("keeps complete datasets out of the runtime Overview path", () => {
    expect(participants()).toContain("projection.participants.filter");
    expect(participants()).toContain("group.rows.map");
    expect(songs()).toContain("projection.entries.filter");
    expect(songs()).toContain("filtered.map");
    expect(schedule()).toContain("projection.shows.filter");
    expect(schedule()).toContain("filtered.map");
    expect(overview()).not.toContain("projection.participants.filter");
    expect(overview()).not.toContain("projection.entries.filter");
    expect(overview()).not.toContain("projection.shows.filter");
  });

  it("keeps Story and Results on their existing dedicated product destinations", () => {
    const screenSource = overview();
    expect(screenSource).toContain("href: projection.story?.href ?? base");
    expect(screenSource).toContain("href: projection.results.showHref ?? base");
    expect(screenSource).toContain('title="Open full story"');
    expect(screenSource).toContain('title="Open complete official result"');
    expect(viewContract()).not.toContain('"results" |');
    expect(viewContract()).not.toContain('"stories" |');
  });

  it("does not introduce fetching, clocks or duplicate authority into any collection surface", () => {
    for (const screenSource of [overview(), participants(), songs(), schedule()]) {
      expect(screenSource).not.toContain("supabase");
      expect(screenSource).not.toContain("useQuery(");
      expect(screenSource).not.toContain("fetch(");
      expect(screenSource).not.toContain("Date.now(");
      expect(screenSource).not.toContain("new Date(");
      expect(screenSource).not.toContain("calculate");
    }
  });
});

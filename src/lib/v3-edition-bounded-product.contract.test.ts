import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const gate = () => source("src/components/v3/V3EditionRouteGate.tsx");
const screen = () => source("src/components/v3/V3EditionProductScreen.tsx");
const viewContract = () => source("src/lib/v3-edition-view.ts");

describe("V3 Edition bounded product architecture", () => {
  it("routes the installed-app Edition through the canonical bounded product surface", () => {
    const gateSource = gate();
    expect(gateSource).toContain("resolveV3EditionCollectionView(searchStr)");
    expect(gateSource).toContain("<V3EditionProductScreen");
    expect(gateSource).toContain("view={editionView}");
    expect(gateSource).toContain("projection={bundle.projection}");
  });

  it("keeps Overview previews within explicit content budgets", () => {
    const screenSource = screen();
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
  });

  it("moves full participant, song and schedule datasets behind deliberate collection views", () => {
    const screenSource = screen();
    expect(screenSource).toContain('view === "participants"');
    expect(screenSource).toContain('view === "songs"');
    expect(screenSource).toContain("projection.participants.map");
    expect(screenSource).toContain("projection.entries.map");
    expect(screenSource).toContain("projection.shows.map");
    expect(screenSource).toContain('label="Find a delegation"');
    expect(screenSource).toContain('label="Find a song, artist or country"');
  });

  it("keeps Story and Results on their existing dedicated product destinations", () => {
    const screenSource = screen();
    expect(screenSource).toContain("href: projection.story?.href ?? base");
    expect(screenSource).toContain("href: projection.results.showHref ?? base");
    expect(screenSource).toContain('title="Open full story"');
    expect(screenSource).toContain('title="Open complete official result"');
    expect(viewContract()).not.toContain('"results" |');
    expect(viewContract()).not.toContain('"stories" |');
  });

  it("does not introduce fetching, clocks, publication inference or result calculation into the presentation slice", () => {
    const screenSource = screen();
    expect(screenSource).not.toContain("supabase");
    expect(screenSource).not.toContain("useQuery(");
    expect(screenSource).not.toContain("fetch(");
    expect(screenSource).not.toContain("Date.now(");
    expect(screenSource).not.toContain("new Date(");
    expect(screenSource).not.toContain("calculate");
  });
});

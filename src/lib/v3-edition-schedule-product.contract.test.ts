import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const screen = () => read("src/components/v3/V3EditionScheduleScreen.tsx");
const gate = () => read("src/components/v3/V3EditionRouteGate.tsx");

describe("V3 Edition Schedule collection", () => {
  it("routes Schedule through its dedicated collection surface", () => {
    const source = gate();
    expect(source).toContain('editionView === "schedule"');
    expect(source).toContain("<V3EditionScheduleScreen");
    expect(source).toContain("projection={bundle.projection}");
  });

  it("uses the server-projected next event instead of browser chronology", () => {
    const source = screen();
    expect(source).toContain("projection.hub.hero.nextEvent");
    expect(source).toContain("const nextEventId = projection.hub.hero.nextEvent?.id ?? null");
    expect(source).toContain("show.id === nextEventId");
    expect(source).toContain("<EventTime");
    expect(source).not.toContain("Date.now(");
    expect(source).not.toContain("new Date(");
    expect(source).not.toContain("setInterval");
  });

  it("supports Show discovery while preserving canonical Edition order", () => {
    const source = screen();
    expect(source).toContain('placeholder="Find a show"');
    expect(source).toContain("projection.shows.filter");
    expect(source).toContain("showKindLabel(show.kind)");
    expect(source).toContain("shown in canonical Edition order");
    expect(source).not.toContain(".sort(");
  });

  it("surfaces only existing publication-safe Show metadata", () => {
    const source = screen();
    expect(source).toContain("show.participantCount");
    expect(source).toContain("show.runningOrderAvailable");
    expect(source).toContain("show.resultsAvailable");
    expect(source).toContain("show.href");
    expect(source).toContain("Time to be announced");
  });

  it("does not fetch, calculate state or create a second Show authority", () => {
    const source = screen();
    expect(source).not.toContain("supabase");
    expect(source).not.toContain("useQuery(");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("resolveShowPublication");
    expect(source).not.toContain("calculate");
  });
});

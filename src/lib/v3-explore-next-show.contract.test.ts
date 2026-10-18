import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 Explore current and archive event projection", () => {
  it("derives the next action from explicit public Show status instead of browser time", () => {
    const source = read("src/integrations/v3/explore-source.server.ts");

    expect(source).toContain("LIVE_SHOW_STATUSES");
    expect(source).toContain("UPCOMING_SHOW_STATUSES");
    expect(source).toContain("resolveV3ExploreNextEvent");
    expect(source).toContain("LIVE_SHOW_STATUSES.has(normalizedShowStatus(show))");
    expect(source).toContain("UPCOMING_SHOW_STATUSES.has(normalizedShowStatus(show))");
    expect(source).not.toContain("Date.now()");
    expect(source).not.toContain("setInterval(");
    expect(source).not.toContain("setTimeout(");
  });

  it("never describes a Show with an already published result as upcoming", () => {
    const source = read("src/integrations/v3/explore-source.server.ts");

    expect(source).toContain("showHasPublishedResult");
    expect(source).toContain("resolveShowPublication(show).results");
    expect(source).toContain("result.show_id === show.id && result.final_rank != null");
    expect(source).toContain("!showHasPublishedResult(show, results)");
  });

  it("uses canonical Show order and does not fabricate a start timestamp", () => {
    const source = read("src/integrations/v3/explore-source.server.ts");

    expect(source).toContain("a.sort_order - b.sort_order");
    expect(source).toContain("startsAt: null");
    expect(source).toContain("href: `/shows/${upcoming.id}`");
    expect(source).toContain("href: `/shows/${live.id}`");
  });

  it("attaches the next event only to the resolved current edition", () => {
    const source = read("src/integrations/v3/explore-source.server.ts");

    expect(source).toContain("currentNextEvent = resolveV3ExploreNextEvent(currentShows, currentResults)");
    expect(source).toContain("nextEvent: isCurrent ? currentNextEvent : null");
  });

  it("projects archive result availability from publication-safe winner evidence", () => {
    const source = read("src/integrations/v3/explore-source.server.ts");

    expect(source).toContain('.in("edition_id", publishedEditionIds)');
    expect(source).toContain('.eq("published", true)');
    expect(source).toContain('.eq("final_rank", 1)');
    expect(source).toContain("resolveShowPublication(show).results");
    expect(source).toContain("resultsPublished: finalResultsPublished(editionShows, editionWinners)");
    expect(source).toContain('resultsPublication: resultsPublished ? "published" : "hidden"');
    expect(source).not.toContain('.from("participants")');
  });

  it("bounds archive result reads to rank-1 evidence instead of downloading scoreboards", () => {
    const source = read("src/integrations/v3/explore-source.server.ts");
    const resultsRead = source.slice(
      source.indexOf('.from("results")'),
      source.indexOf("throwIfError(winnersResult.error"),
    );

    expect(resultsRead).toContain('.eq("final_rank", 1)');
    expect(resultsRead).not.toContain("jury_votes");
    expect(resultsRead).not.toContain("televotes");
  });

  it("keeps the existing Explore UI honest when no canonical time exists", () => {
    const screen = read("src/components/v3/V3ExploreScreen.tsx");

    expect(screen).toContain('edition.nextEvent.startsAt ?? "Time to be announced"');
    expect(screen).toContain("to={edition.nextEvent.href}");
    expect(screen).toContain('edition.resultsAvailable ? "Official results available" : "Explore edition"');
  });
});

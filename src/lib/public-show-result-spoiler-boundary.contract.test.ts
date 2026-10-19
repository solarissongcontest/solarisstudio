import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public Show result spoiler boundary", () => {
  it("uses the same local and server spoiler authority as V3 Results", () => {
    const route = read("src/routes/shows/$showId.tsx");

    expect(route).toContain("useAppExperiencePreferences");
    expect(route).toContain("useFanSession");
    expect(route).toContain("useNotificationPreferences");
    expect(route).toContain("resolveV3ResultsSpoilerProtection");
    expect(route).toContain("localSpoilerFree: preferences.spoilerFree");
    expect(route).toContain("viewerResolved: viewer.isSuccess");
    expect(route).toContain("serverSpoilerFree: serverPreferences.data?.spoiler_free ?? null");
  });

  it("protects only installed-app Shows with canonically published results", () => {
    const route = read("src/routes/shows/$showId.tsx");
    const guardStart = route.indexOf("const hideResultSpoilers =");
    const guardEnd = route.indexOf("const voting =", guardStart);
    const guardDecision = route.slice(guardStart, guardEnd);

    expect(guardStart).toBeGreaterThan(0);
    expect(guardDecision).toContain("isAppMode &&");
    expect(guardDecision).toContain("publication.results &&");
    expect(guardDecision).toContain("!resultSpoilersRevealed");
  });

  it("returns the spoiler guard before winner, ranking, points and detailed-vote render paths", () => {
    const route = read("src/routes/shows/$showId.tsx");
    const protectedReturn = route.indexOf("if (hideResultSpoilers)");
    const winner = route.indexOf("const winnerStanding =");
    const scoreboard = route.indexOf('tab === "scoreboard"');
    const points = route.indexOf('tab === "points"');
    const matrix = route.indexOf('tab === "matrix"');

    expect(protectedReturn).toBeGreaterThan(0);
    expect(route.slice(protectedReturn, winner)).toContain("<PublicShowResultSpoilerGuard");
    expect(winner).toBeGreaterThan(protectedReturn);
    expect(scoreboard).toBeGreaterThan(protectedReturn);
    expect(points).toBeGreaterThan(protectedReturn);
    expect(matrix).toBeGreaterThan(protectedReturn);
  });

  it("requires deliberate reveal for each Show instead of carrying disclosure across route params", () => {
    const route = read("src/routes/shows/$showId.tsx");

    expect(route).toContain("setResultSpoilersRevealed(true)");
    expect(route).toContain("setResultSpoilersRevealed(false)");
    expect(route).toContain("}, [showId]);");
  });

  it("renders no result payload inside the protected presentation", () => {
    const guard = read("src/components/public/PublicShowResultSpoilerGuard.tsx");

    expect(guard).toContain('data-public-show-spoilers="protected"');
    expect(guard).toContain("Reveal show result");
    expect(guard).not.toContain("standings");
    expect(guard).not.toContain("winnerStanding");
    expect(guard).not.toContain("jury_points");
    expect(guard).not.toContain("televote_points");
    expect(guard).not.toContain("qualified:");
    expect(guard).not.toContain("VotingMatrix");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { V3PublishedResultSnapshot } from "./v3-public-result-snapshot";
import { resolveV3PublicShowResultVisibility } from "./v3-public-show-result-visibility";
import { DEFAULT_VOTING, type VotingConfig } from "./voting";

type PublishedScores = Pick<V3PublishedResultSnapshot, "availability" | "rows">;

const rounds = [
  { id: "app", label: "App", weight: 50 },
  { id: "web", label: "Web", weight: 50 },
];

const voting = (changes: Partial<VotingConfig> = {}): VotingConfig => ({
  ...DEFAULT_VOTING, juryEnabled: false, televoteEnabled: true, televoteRounds: rounds, ...changes,
});

function snapshot(): PublishedScores {
  return {
    availability: { results: true, jury: true, televote: true, detailedVoting: true },
    rows: [{
      countryId: "11111111-1111-4111-8111-111111111111",
      contestEntityId: null,
      totalPoints: 30,
      finalRank: 1,
      juryPoints: 10,
      televotePoints: 20,
      televoteComponents: [
        { round_id: "app", label: "App", points: 12 },
        { round_id: "web", label: "Web", points: 8 },
      ],
    }],
  };
}

describe("immutable Show scores: publication and active voting channels", () => {
  it("fails closed when canonical publication is missing", () => {
    expect(resolveV3PublicShowResultVisibility(null, voting())).toEqual({
      jury: false, televote: false, multiRoundTelevote: false,
    });
  });

  it("does not show unpublished splits even when the channels were enabled", () => {
    const data = snapshot();
    data.availability.jury = false;
    data.availability.televote = false;
    expect(resolveV3PublicShowResultVisibility(data, voting({ juryEnabled: true }))).toEqual({
      jury: false, televote: false, multiRoundTelevote: false,
    });
  });

  it("does not fabricate inactive channel comparisons from published zero scores", () => {
    expect(resolveV3PublicShowResultVisibility(snapshot(), voting({
      juryEnabled: true, televoteEnabled: false,
    }))).toEqual({ jury: true, televote: false, multiRoundTelevote: false });
    expect(resolveV3PublicShowResultVisibility(snapshot(), voting())).toMatchObject({
      jury: false, televote: true,
    });
  });

  it("preserves both legitimate published and enabled voting splits", () => {
    expect(resolveV3PublicShowResultVisibility(snapshot(), voting({ juryEnabled: true }))).toEqual({
      jury: true, televote: true, multiRoundTelevote: false,
    });
  });

  it("keeps published Televote aggregate visible when detailed round components are withheld", () => {
    const data = snapshot();
    data.availability.detailedVoting = false;
    data.rows[0].televoteComponents = undefined;
    expect(resolveV3PublicShowResultVisibility(data, voting())).toEqual({
      jury: false, televote: true, multiRoundTelevote: false,
    });
  });

  it("never invents zero points for missing or invalid published rounds", () => {
    const data = snapshot();
    data.rows[0].televoteComponents = [{ round_id: "app", points: 12 }];
    expect(resolveV3PublicShowResultVisibility(data, voting()).multiRoundTelevote).toBe(false);
    data.rows[0].televoteComponents = [
      { round_id: "app", points: 12 },
      { round_id: "web", points: "not-published" },
    ];
    expect(resolveV3PublicShowResultVisibility(data, voting()).multiRoundTelevote).toBe(false);
  });

  it("rejects partial coverage across entries and duplicated round components", () => {
    const data = snapshot();
    data.rows.push({
      countryId: "22222222-2222-4222-8222-222222222222",
      contestEntityId: null,
      totalPoints: 0, finalRank: 2, juryPoints: 0, televotePoints: 0,
    });
    expect(resolveV3PublicShowResultVisibility(data, voting()).multiRoundTelevote).toBe(false);
    data.rows.pop();
    data.rows[0].televoteComponents = [
      { round_id: "app", points: 12 },
      { round_id: "app", points: 12 },
      { round_id: "web", points: 8 },
    ];
    expect(resolveV3PublicShowResultVisibility(data, voting()).multiRoundTelevote).toBe(false);
  });

  it("displays genuine completely published multi-round totals without changing ranks", () => {
    expect(resolveV3PublicShowResultVisibility(snapshot(), voting())).toEqual({
      jury: false, televote: true, multiRoundTelevote: true,
    });
  });

  it("hides incomplete splits instead of replacing missing values with zero", () => {
    const data = snapshot();
    data.rows[0].juryPoints = null;
    data.rows[0].televotePoints = null;
    expect(resolveV3PublicShowResultVisibility(data, voting({ juryEnabled: true }))).toEqual({
      jury: false, televote: false, multiRoundTelevote: false,
    });
  });

  it("wires Show source to the publication-safe resolver and detail permission", () => {
    const route = readFileSync(resolve(process.cwd(), "src/routes/shows/$showId.tsx"), "utf8");
    expect(route).toContain("resolveV3PublicShowResultVisibility(frozenResult, voting)");
    expect(route).toContain("const hasPublishedDetailedVoting =");
    expect(route).toContain("publication.detailed_voting && frozenResult?.availability.detailedVoting === true");
    expect(route).toContain("const completePoints = points.filter(");
    expect(route).not.toContain("component?.points ?? 0");
  });
});

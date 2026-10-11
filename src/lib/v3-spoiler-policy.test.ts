import { describe, expect, it } from "vitest";

import {
  resolveV3SpoilerDecision,
  v3SpoilerSafeResultCopy,
  v3SpoilerSafeResultMetadata,
  type V3SpoilerSurface,
} from "./v3-spoiler-policy";

const protectedDecision = (surface: V3SpoilerSurface) =>
  resolveV3SpoilerDecision({
    preference: "hide-until-reveal",
    resultsPublished: true,
    explicitlyRevealed: false,
    surface,
  });

describe("V3 spoiler policy", () => {
  it.each<V3SpoilerSurface>([
    "home",
    "results",
    "edition",
    "notification",
    "push",
    "search",
    "following",
  ])("protects published results consistently on %s", (surface) => {
    expect(protectedDecision(surface)).toEqual({
      canRevealResult: true,
      canMentionWinner: false,
      canShowRanks: false,
      canShowPoints: false,
      resultAvailable: true,
      protected: true,
      reason: "protected",
    });
  });

  it("reveals result details immediately when the user preference allows it", () => {
    expect(
      resolveV3SpoilerDecision({
        preference: "show-immediately",
        resultsPublished: true,
        explicitlyRevealed: false,
        surface: "home",
      }),
    ).toMatchObject({
      canMentionWinner: true,
      canShowRanks: true,
      canShowPoints: true,
      protected: false,
      reason: "preference-allows",
    });
  });

  it("reveals protected results after an explicit reveal", () => {
    expect(
      resolveV3SpoilerDecision({
        preference: "hide-until-reveal",
        resultsPublished: true,
        explicitlyRevealed: true,
        surface: "results",
      }),
    ).toMatchObject({
      canMentionWinner: true,
      protected: false,
      reason: "revealed",
    });
  });

  it("does not claim a reveal is available before publication", () => {
    expect(
      resolveV3SpoilerDecision({
        preference: "hide-until-reveal",
        resultsPublished: false,
        explicitlyRevealed: false,
        surface: "push",
      }),
    ).toEqual({
      canRevealResult: false,
      canMentionWinner: false,
      canShowRanks: false,
      canShowPoints: false,
      resultAvailable: false,
      protected: false,
      reason: "not-published",
    });
  });

  it("produces spoiler-safe notification copy before reveal", () => {
    expect(
      v3SpoilerSafeResultCopy(
        {
          editionLabel: "SSC 22",
          winnerName: "Oland",
          winnerPoints: 312,
        },
        protectedDecision("notification"),
      ),
    ).toEqual({
      title: "SSC 22 results are available",
      description: "Result spoilers are hidden until you choose to reveal them.",
    });
  });

  it("may include winner and points after disclosure is allowed", () => {
    const decision = resolveV3SpoilerDecision({
      preference: "show-immediately",
      resultsPublished: true,
      explicitlyRevealed: false,
      surface: "home",
    });

    expect(
      v3SpoilerSafeResultCopy(
        {
          editionLabel: "SSC 22",
          winnerName: "Oland",
          winnerPoints: 312,
        },
        decision,
      ),
    ).toEqual({
      title: "Oland wins SSC 22",
      description: "Oland finished first with 312 points.",
    });
  });

  it("strips common spoiler-bearing metadata fields before protected delivery", () => {
    expect(
      v3SpoilerSafeResultMetadata(
        {
          editionId: "22",
          winnerName: "Oland",
          winnerPoints: 312,
          finalRank: 1,
          juryPoints: 150,
          televotePoints: 162,
          safeRoute: "/results/ssc22",
        },
        protectedDecision("push"),
      ),
    ).toEqual({
      editionId: "22",
      safeRoute: "/results/ssc22",
    });
  });
});

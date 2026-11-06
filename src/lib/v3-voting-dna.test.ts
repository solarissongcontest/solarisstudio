import { describe, expect, it } from "vitest";

import {
  VOTING_DNA_PRESENTATION_FORMULA_VERSION,
  averagePublishedTotals,
  getVotingDnaAvailability,
  type VotingDnaAggregate,
} from "./v3-voting-dna";

function aggregate(overrides: Partial<VotingDnaAggregate> = {}): VotingDnaAggregate {
  return {
    sample: {
      detailedEditions: 0,
      givenPoints: 0,
      receivedPoints: 0,
      resultEditions: 0,
    },
    topGiven: [],
    topReceived: [],
    results: [],
    ...overrides,
  };
}

describe("V3 Voting DNA presentation", () => {
  it("fails closed to an explicit insufficient-data state when nothing is published", () => {
    expect(getVotingDnaAvailability(aggregate())).toEqual({
      hasAnyPublishedData: false,
      hasDetailedVotingSample: false,
      hasResultSample: false,
      limitedDetailedSample: false,
      limitedResultSample: false,
    });
  });

  it("treats published result history as usable without inventing detailed ballot evidence", () => {
    const result = {
      editionId: "edition-1",
      showId: "show-1",
      finalRank: 4,
      juryPoints: 80,
      televotePoints: 60,
      totalPoints: 140,
    };

    expect(
      getVotingDnaAvailability(
        aggregate({
          sample: {
            detailedEditions: 0,
            givenPoints: 0,
            receivedPoints: 0,
            resultEditions: 1,
          },
          results: [result],
        }),
      ),
    ).toMatchObject({
      hasAnyPublishedData: true,
      hasDetailedVotingSample: false,
      hasResultSample: true,
      limitedResultSample: true,
    });
  });

  it("requires an actual published directional row before claiming a detailed-voting sample", () => {
    const noDirectionalRows = aggregate({
      sample: {
        detailedEditions: 1,
        givenPoints: 0,
        receivedPoints: 0,
        resultEditions: 0,
      },
    });

    expect(getVotingDnaAvailability(noDirectionalRows).hasDetailedVotingSample).toBe(false);

    const withDirectionalRow = aggregate({
      sample: {
        detailedEditions: 1,
        givenPoints: 12,
        receivedPoints: 0,
        resultEditions: 0,
      },
      topGiven: [{ countryId: "country-2", points: 12, ballots: 1 }],
    });

    expect(getVotingDnaAvailability(withDirectionalRow)).toMatchObject({
      hasAnyPublishedData: true,
      hasDetailedVotingSample: true,
      limitedDetailedSample: true,
    });
  });

  it("keeps the derived average deterministic and explicitly versioned", () => {
    expect(VOTING_DNA_PRESENTATION_FORMULA_VERSION).toBe("v1");
    expect(averagePublishedTotals([12, 18, 30])).toBe(20);
    expect(averagePublishedTotals([])).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import {
  parseV3PublicVotingDna,
  type V3PublicVotingDna,
} from "./v3-public-voting-dna";

const COUNTRY_A = "11111111-1111-4111-8111-111111111111";
const COUNTRY_B = "22222222-2222-4222-8222-222222222222";
const EDITION = "33333333-3333-4333-8333-333333333333";
const SHOW = "44444444-4444-4444-8444-444444444444";
const SHOW_TWO = "55555555-5555-4555-8555-555555555555";

function projection(): V3PublicVotingDna {
  return {
    schemaVersion: 1,
    formulaVersion: "v1",
    sample: {
      detailedEditions: 1,
      detailedEditionIds: [EDITION],
      givenPoints: 12,
      receivedPoints: 10,
      resultEditions: 1,
    },
    topGiven: [{ countryId: COUNTRY_B, points: 12, ballots: 1 }],
    topReceived: [{ countryId: COUNTRY_B, points: 10, ballots: 1 }],
    results: [
      {
        editionId: EDITION,
        showId: SHOW,
        finalRank: 3,
        totalPoints: 140,
        juryPublished: true,
        juryPoints: 80,
        televotePublished: false,
        televotePoints: null,
      },
    ],
  };
}

describe("V3 Public Voting DNA projection", () => {
  it("accepts independently published split-result layers with exact historical scope", () => {
    expect(parseV3PublicVotingDna(projection())).toMatchObject({
      schemaVersion: 1,
      formulaVersion: "v1",
      sample: {
        detailedEditions: 1,
        detailedEditionIds: [EDITION],
      },
      results: [
        {
          juryPublished: true,
          juryPoints: 80,
          televotePublished: false,
          televotePoints: null,
          totalPoints: 140,
        },
      ],
    });
  });

  it("rejects a hidden Jury layer that serializes Jury points", () => {
    const value = projection();
    value.results[0] = {
      ...value.results[0],
      juryPublished: false,
      juryPoints: 80,
    };

    expect(() => parseV3PublicVotingDna(value)).toThrow(
      "juryPoints must be null while its result layer is hidden",
    );
  });

  it("rejects a hidden Televote layer that serializes Televote points", () => {
    const value = projection();
    value.results[0] = {
      ...value.results[0],
      televotePublished: false,
      televotePoints: 60,
    };

    expect(() => parseV3PublicVotingDna(value)).toThrow(
      "televotePoints must be null while its result layer is hidden",
    );
  });

  it("rejects a published split layer without its public value", () => {
    const value = projection();
    value.results[0] = {
      ...value.results[0],
      juryPublished: true,
      juryPoints: null,
    };

    expect(() => parseV3PublicVotingDna(value)).toThrow(
      "juryPoints must be a non-negative finite number",
    );
  });

  it("rejects detailed-edition scope drift", () => {
    const value = projection();
    value.sample.detailedEditions = 2;

    expect(() => parseV3PublicVotingDna(value)).toThrow(
      "Voting DNA detailed edition scope count mismatch",
    );
  });

  it("rejects result-count drift instead of repairing projection truth in the browser", () => {
    const value = projection();
    value.sample.resultEditions = 2;

    expect(() => parseV3PublicVotingDna(value)).toThrow(
      "Voting DNA result sample count mismatch",
    );
  });

  it("rejects duplicate edition rows instead of accepting ambiguous historical scope", () => {
    const value = projection();
    value.sample.resultEditions = 2;
    value.results.push({
      ...value.results[0],
      showId: SHOW_TWO,
    });

    expect(() => parseV3PublicVotingDna(value)).toThrow(
      "Voting DNA result sample contains duplicate edition identity",
    );
  });

  it("rejects malformed identity and unsupported projection versions", () => {
    expect(() =>
      parseV3PublicVotingDna({
        ...projection(),
        schemaVersion: 2,
      }),
    ).toThrow("Unsupported Voting DNA schema version");

    const invalidIdentity = projection();
    invalidIdentity.topGiven[0] = {
      ...invalidIdentity.topGiven[0],
      countryId: "oland",
    };
    expect(() => parseV3PublicVotingDna(invalidIdentity)).toThrow(
      "topGiven[0].countryId must be a UUID",
    );
  });

  it("keeps relationship arrays bounded", () => {
    const value = projection();
    value.topGiven = Array.from({ length: 11 }, (_, index) => ({
      countryId:
        index === 0
          ? COUNTRY_A
          : `${(index + 10).toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`,
      points: index,
      ballots: 1,
    }));

    expect(() => parseV3PublicVotingDna(value)).toThrow(
      "topGiven exceeds the bounded relationship contract",
    );
  });
});

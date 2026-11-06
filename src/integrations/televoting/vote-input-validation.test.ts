import { describe, expect, it } from "vitest";

import type { TelevotingVoteEntry, TelevotingVoteInput } from "./vote.functions";
import {
  MAX_TELEVOTE_BALLOT_ENTRIES,
  validateBallot,
} from "./vote-input-validation";

function entriesFor(points: number[]): TelevotingVoteEntry[] {
  return points.map((points, index) => ({
    target_country_code: `N${index + 1}`,
    points,
  }));
}

function ballot(entries: TelevotingVoteEntry[]): TelevotingVoteInput {
  return {
    roundId: "local-round",
    username: " Voter ",
    countryCode: "OL",
    entries,
  };
}

describe("S8 bounded Televote ballot validation", () => {
  it("preserves legal five-entry and twenty-entry 20-point ballots", () => {
    expect(validateBallot(ballot(entriesFor([10, 5, 3, 1, 1]))).username).toBe(
      "Voter",
    );
    expect(MAX_TELEVOTE_BALLOT_ENTRIES).toBe(20);
    expect(
      validateBallot(ballot(entriesFor(Array(20).fill(1)))).entries,
    ).toHaveLength(20);
  });

  it("rejects overlong lists before traversing or reading their entries", () => {
    const oversized = new Proxy(entriesFor(Array(21).fill(1)), {
      get(target, property, receiver) {
        if (property === "0") {
          throw new Error("The oversized ballot was traversed");
        }
        return Reflect.get(target, property, receiver);
      },
    });
    expect(() => validateBallot(ballot(oversized))).toThrow(
      "Vote for 5 to 20 entries",
    );
    expect(() => validateBallot(ballot(entriesFor(Array(50_000).fill(1))))).toThrow(
      "Vote for 5 to 20 entries",
    );
  });

  it("fails closed on missing or undersized selections", () => {
    expect(() => validateBallot(ballot([]))).toThrow("Vote for 5 to 20 entries");
    expect(() => validateBallot(ballot(entriesFor([10, 5, 3, 2])))).toThrow(
      "Vote for 5 to 20 entries",
    );
    expect(() => validateBallot(ballot(null as unknown as TelevotingVoteEntry[]))).toThrow(
      "Vote for 5 to 20 entries",
    );
  });

  it("rejects malformed targets and point values before totaling", () => {
    const valid = entriesFor([10, 5, 3, 1, 1]);
    expect(() =>
      validateBallot(
        ballot([{ ...valid[0], points: "10" as unknown as number }, ...valid.slice(1)]),
      ),
    ).toThrow("Each selected entry must receive between 1 and 10 points");
    expect(() =>
      validateBallot(
        ballot([null as unknown as TelevotingVoteEntry, ...valid.slice(1)]),
      ),
    ).toThrow("Each selected entry must receive between 1 and 10 points");
    expect(() =>
      validateBallot(
        ballot([{ ...valid[0], target_country_code: "" }, ...valid.slice(1)]),
      ),
    ).toThrow("Each selected entry must receive between 1 and 10 points");
  });

  it("preserves the exact-point and unique-target rules", () => {
    expect(() => validateBallot(ballot(entriesFor([10, 5, 3, 2, 1])))).toThrow(
      "You must distribute exactly 20 points",
    );
    const duplicate = entriesFor([10, 5, 3, 1, 1]);
    duplicate[1].target_country_code = duplicate[0].target_country_code;
    expect(() => validateBallot(ballot(duplicate))).toThrow("Duplicate voting entry");
  });
});

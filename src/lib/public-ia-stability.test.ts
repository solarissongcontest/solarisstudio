import { describe, expect, it } from "vitest";

import { evaluateBeta3Gates } from "./public-ia-stability";

const successfulAnswers = {
  beta3OldWinnerOutcome: "Found immediately",
  beta3CountryEntryOutcome: "Found immediately",
  beta3JuryScoresOutcome: "Found immediately",
  beta3CompareOutcome: "Found immediately",
  beta3ResultScenarioOutcome: "Found immediately",
  beta3ConfirmationOutcome: "Found immediately",
  beta3JuryVotingOutcome: "Found immediately",
  beta3EntryRuleOutcome: "Found immediately",
  beta3ConcernOutcome: "Found immediately",
  beta3AppealOutcome: "Found immediately",
  beta3TasteOutcome: "Found immediately",
  beta3CountryToolsOutcome: "Found immediately",
};

describe("Public IA retirement evidence", () => {
  it("does not fabricate a pass when the Beta 3 sample is empty", () => {
    const gates = evaluateBeta3Gates([], null);

    expect(gates).toHaveLength(6);
    expect(gates.every((gate) => !gate.passed)).toBe(true);
    expect(gates.find((gate) => gate.key === "sample")?.value).toBe(0);
  });

  it("uses the existing Beta 3 thresholds for a comparable passing sample", () => {
    const submissions = Array.from({ length: 10 }, (_, index) => ({
      device: index < 5 ? "Phone" : "Desktop",
      answers: successfulAnswers,
    }));
    const gates = evaluateBeta3Gates(submissions, 80);

    expect(gates.every((gate) => gate.passed)).toBe(true);
  });

  it("keeps missing device comparison evidence blocked", () => {
    const submissions = Array.from({ length: 10 }, () => ({
      device: "Desktop",
      answers: successfulAnswers,
    }));
    const gates = evaluateBeta3Gates(submissions, 100);

    expect(gates.find((gate) => gate.key === "device-gap")).toMatchObject({
      value: null,
      passed: false,
    });
  });
});

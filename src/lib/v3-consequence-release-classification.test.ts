import { describe, expect, it } from "vitest";
import { classifyV3ConsequenceRelease, requiredConsequenceMaturity } from "./v3-consequence-release-classification";

describe("risk-tiered consequence maturity", () => {
  it("keeps official contest effects integrity critical", () => {
    for (const eventType of ["jury.ballot_changed", "televote.closed", "results.calculated", "result.finalized", "publication.changed", "confirmation.submitted", "entry.reviewed"]) {
      expect(classifyV3ConsequenceRelease(eventType)).toBe("integrity_critical");
    }
    expect(requiredConsequenceMaturity("integrity_critical")).toContain("reconciled");
  });

  it("treats delivery failures as delivery critical without inventing full domain reconciliation", () => {
    expect(classifyV3ConsequenceRelease("notification.failed")).toBe("delivery_critical");
    expect(requiredConsequenceMaturity("delivery_critical")).toContain("failure_visibility");
    expect(requiredConsequenceMaturity("delivery_critical")).not.toContain("reconciled");
  });

  it("does not force event/outbox ceremony on pure reads", () => {
    expect(classifyV3ConsequenceRelease("activity.projected")).toBe("observational_or_pure_read");
    expect(classifyV3ConsequenceRelease("receipt.reconciled")).toBe("observational_or_pure_read");
    expect(requiredConsequenceMaturity("observational_or_pure_read")).toEqual(["canonical_source", "no_mutation_authority"]);
  });
});

it("fails closed for unknown consequence identities rather than silently assigning debt", () => {
  for (const event of ["new_security.access_changed", "analytics.updated", "", "unknown.event"]) {
    expect(classifyV3ConsequenceRelease(event)).toBe("integrity_critical");
  }
  expect(classifyV3ConsequenceRelease("public_ux.observed")).toBe("derived");
});

import { describe, expect, it } from "vitest";
import { assertS14Certification } from "../../scripts/lib/v3-s14-certification";
import { V3_S14_FAILURE_INJECTIONS, V3_S14_INVARIANTS, V3_S14_STAGES } from "../../scripts/v3-s14-full-contest-spec";
const sha = "a".repeat(40);
const valid = () => ({
  candidateSha: sha, passed: true, partial: false, runtimeFailure: false,
  lifecycle: { finalState: "archived" }, runIdentity: { candidateSha: sha, editionId: "edition", databaseFingerprint: "isolated" },
  seed: { editionCount: 1, delegationCount: 66, showCount: 3 },
  completedStages: V3_S14_STAGES.map((s) => s.id), pendingStages: [],
  completedContestExtensions: ["grand-final-qualifier-bridge", "grand-final-voting", "grand-final-results", "grand-final-publication"],
  pendingContestExtensions: [], blockedContestExtensions: [],
  implementedInvariants: V3_S14_INVARIANTS.map((s) => s.id), implementedFailureInjections: V3_S14_FAILURE_INJECTIONS.map((s) => s.id),
});
describe("late S15 prerequisite", () => {
  it("accepts complete exact-head S14 and rejects older, partial or incomplete evidence", () => {
    expect(() => assertS14Certification(valid(), sha)).not.toThrow();
    expect(() => assertS14Certification(valid(), "b".repeat(40))).toThrow();
    expect(() => assertS14Certification({ ...valid(), partial: true }, sha)).toThrow();
    expect(() => assertS14Certification({ ...valid(), completedStages: valid().completedStages.slice(0, 9) }, sha)).toThrow();
    expect(() => assertS14Certification({ ...valid(), implementedFailureInjections: [] }, sha)).toThrow();
  });
});

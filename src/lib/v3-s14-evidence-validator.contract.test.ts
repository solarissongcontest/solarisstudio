import { describe, expect, it } from "vitest";
import {
  V3_S14_CONTEST_EXTENSIONS,
  V3_S14_FAILURE_INJECTIONS,
  V3_S14_INVARIANTS,
  V3_S14_STAGES,
} from "../../scripts/v3-s14-full-contest-spec";
import { validateV3S14Evidence } from "../../scripts/v3-s14-evidence-validator";

const candidateSha = "a".repeat(40);
const stageIds = V3_S14_STAGES.map((stage) => stage.id);
const extensionIds = [...V3_S14_CONTEST_EXTENSIONS];
const invariantIds = V3_S14_INVARIANTS.map((item) => item.id);
const failureIds = V3_S14_FAILURE_INJECTIONS.map((item) => item.id);

function completeEvidence(): Record<string, unknown> {
  return {
    schemaVersion: 3,
    candidateSha,
    passed: true,
    partial: false,
    runtimeFailure: false,
    completedStages: [...stageIds],
    pendingStages: [],
    completedContestExtensions: [...extensionIds],
    pendingContestExtensions: [],
    blockedContestExtensions: [],
    implementedInvariants: [...invariantIds],
    implementedFailureInjections: [...failureIds],
    seed: { editionCount: 1, delegationCount: 66, showCount: 3 },
    runIdentity: {
      runId: "s14-test-run",
      editionId: "00000000-0000-4000-8000-000000000001",
      databaseFingerprint: "local-test-db:fingerprint",
      candidateSha,
    },
    lifecycle: { finalState: "archived" },
  };
}

function failureEvidence(): Record<string, unknown> {
  return {
    schemaVersion: 3,
    candidateSha,
    passed: false,
    partial: true,
    runtimeFailure: true,
    failurePhase: "stage-4-entries",
    failureStage: "stage-4-entries: concurrent edit guard",
    exitCode: 1,
    completedStages: stageIds.slice(0, 3),
    pendingStages: stageIds.slice(3),
    completedContestExtensions: [],
    pendingContestExtensions: [...extensionIds],
    blockedContestExtensions: [],
    seed: { editionCount: 1, delegationCount: 66, showCount: 3 },
    runIdentity: {
      runId: "s14-test-run-failed",
      editionId: "00000000-0000-4000-8000-000000000001",
      databaseFingerprint: "local-test-db:fingerprint",
      candidateSha,
    },
  };
}

function expectCompleteFailure(mutator: (evidence: Record<string, unknown>) => void, message: RegExp) {
  const evidence = completeEvidence();
  mutator(evidence);
  expect(() => validateV3S14Evidence({ candidateSha, evidence, requireComplete: true })).toThrow(message);
}

describe("S14 semantic exact-SHA evidence contract", () => {
  it("accepts complete canonical evidence through Archive", () => {
    expect(() =>
      validateV3S14Evidence({ candidateSha, evidence: completeEvidence(), requireComplete: true }),
    ).not.toThrow();
  });

  it("rejects evidence for the wrong candidate SHA", () => {
    expectCompleteFailure((evidence) => {
      evidence.candidateSha = "b".repeat(40);
    }, /candidate SHA mismatch/);
  });

  it("rejects a mutation that removes Stage 10 Archive", () => {
    expectCompleteFailure((evidence) => {
      evidence.completedStages = stageIds.slice(0, -1);
      evidence.pendingStages = ["stage-10-archive"];
    }, /completedStages must equal canonical order/);
  });

  it("rejects Archive remaining pending", () => {
    expectCompleteFailure((evidence) => {
      evidence.pendingStages = ["stage-10-archive"];
    }, /pendingStages must equal canonical order/);
  });

  it("rejects a non-archived final lifecycle state", () => {
    expectCompleteFailure((evidence) => {
      evidence.lifecycle = { finalState: "completed" };
    }, /lifecycle\.finalState must be archived/);
  });

  it("rejects missing Grand Final publication", () => {
    expectCompleteFailure((evidence) => {
      evidence.completedContestExtensions = extensionIds.slice(0, -1);
      evidence.pendingContestExtensions = ["grand-final-publication"];
    }, /completedContestExtensions must equal canonical order/);
  });

  it("rejects Grand Final publication remaining pending even if completion was claimed", () => {
    expectCompleteFailure((evidence) => {
      evidence.pendingContestExtensions = ["grand-final-publication"];
    }, /pendingContestExtensions must equal canonical order/);
  });

  it("rejects removal of any required invariant", () => {
    expectCompleteFailure((evidence) => {
      evidence.implementedInvariants = invariantIds.slice(0, -1);
    }, /implementedInvariants is missing required values/);
  });

  it("keeps genuine runtime failure evidence partial and diagnostic", () => {
    const evidence = failureEvidence();
    expect(() => validateV3S14Evidence({ candidateSha, evidence })).not.toThrow();
    expect(evidence).toMatchObject({
      passed: false,
      partial: true,
      runtimeFailure: true,
      failurePhase: "stage-4-entries",
      exitCode: 1,
      candidateSha,
    });
    expect(() => validateV3S14Evidence({ candidateSha, evidence, requireComplete: true })).toThrow(
      /complete evidence must be passed=true/,
    );
  });

  it("rejects failure evidence that manufactures successful Archive completion", () => {
    const evidence = failureEvidence();
    evidence.lifecycle = { finalState: "archived" };
    expect(() => validateV3S14Evidence({ candidateSha, evidence })).toThrow(
      /must not manufacture archived completion/,
    );
  });

  it("rejects failure evidence without useful phase diagnostics", () => {
    const evidence = failureEvidence();
    evidence.failurePhase = "unknown";
    expect(() => validateV3S14Evidence({ candidateSha, evidence })).toThrow(/concrete failurePhase/);
  });

  it("rejects release evidence containing secret-shaped fields", () => {
    expectCompleteFailure((evidence) => {
      evidence.serviceRoleKey = "must-never-enter-evidence";
    }, /not allowed in sanitized release evidence/);
  });
});

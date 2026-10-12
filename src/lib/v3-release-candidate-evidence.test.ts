import { describe, expect, it } from "vitest";

import { evaluateV3ReleaseCandidateEvidence } from "./v3-release-candidate-evidence";
import type {
  V3CriticalWorkflow,
  V3VerificationGate,
  V3WorkflowCutoverDecision,
  V3WorkflowCutoverStage,
} from "./v3-workflow-cutover-gate";

const SHA = "1234567890abcdef1234567890abcdef12345678";
const OLD_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OBSERVED_AT = "2026-10-12T04:30:00.000Z";

function verification(
  gate: V3VerificationGate,
  status: "passed" | "failed" | "skipped" = "passed",
  candidateSha = SHA,
) {
  return {
    candidateSha,
    evidenceRef: `github-check:${gate}:1234`,
    observedAt: OBSERVED_AT,
    gate,
    status,
  } as const;
}

function decision(
  workflow: V3CriticalWorkflow,
  stage: V3WorkflowCutoverStage,
  overrides: Partial<V3WorkflowCutoverDecision> = {},
  candidateSha = SHA,
) {
  return {
    candidateSha,
    evidenceRef: `cutover:${workflow}:${stage}:1234`,
    observedAt: OBSERVED_AT,
    decision: {
      workflow,
      stage,
      allowed: true,
      blockers: [],
      ...overrides,
    },
  };
}

function observability(
  target: "limited" | "full" | "retire_legacy",
  overrides: Partial<{
    candidateSha: string;
    ready: boolean;
    blockers: readonly { id: string; passed: boolean }[];
    windowStart: string;
    windowEnd: string;
    observedAt: string;
  }> = {},
) {
  return {
    candidateSha: overrides.candidateSha ?? SHA,
    evidenceRef: `telemetry:${target}:window-1`,
    observedAt: overrides.observedAt ?? OBSERVED_AT,
    windowStart: overrides.windowStart ?? "2026-10-12T03:00:00.000Z",
    windowEnd: overrides.windowEnd ?? "2026-10-12T04:00:00.000Z",
    decision: {
      target,
      ready: overrides.ready ?? true,
      blockers: overrides.blockers ?? [],
    },
  } as const;
}

const allVerification = [
  verification("functional"),
  verification("visual"),
  verification("interaction"),
  verification("infrastructure"),
];

describe("Solaris Studio V3 release candidate evidence", () => {
  it("allows shadow with candidate-bound infrastructure proof and matching shadow decisions", () => {
    const result = evaluateV3ReleaseCandidateEvidence({
      candidateSha: SHA.toUpperCase(),
      target: "shadow",
      workflows: ["confirmation", "jury"],
      verification: [verification("infrastructure")],
      workflowDecisions: [
        decision("confirmation", "shadow"),
        decision("jury", "shadow"),
      ],
    });

    expect(result.ready).toBe(true);
    expect(result.candidateSha).toBe(SHA);
    expect(result.blockers).toEqual([]);
  });

  it("requires all four verification gates for a real limited cutover", () => {
    const result = evaluateV3ReleaseCandidateEvidence({
      candidateSha: SHA,
      target: "limited",
      workflows: ["confirmation"],
      verification: [verification("functional"), verification("infrastructure")],
      workflowDecisions: [decision("confirmation", "limited")],
      observability: observability("limited"),
    });

    expect(result.ready).toBe(false);
    expect(result.blockers.map((item) => item.id)).toEqual([
      "verification.visual.missing",
      "verification.interaction.missing",
    ]);
  });

  it("does not accept failed or skipped verification as release proof", () => {
    const result = evaluateV3ReleaseCandidateEvidence({
      candidateSha: SHA,
      target: "full",
      workflows: ["media"],
      verification: [
        verification("functional"),
        verification("visual", "failed"),
        verification("interaction", "skipped"),
        verification("infrastructure"),
      ],
      workflowDecisions: [decision("media", "full")],
      observability: observability("full"),
    });

    expect(result.ready).toBe(false);
    expect(result.blockers.map((item) => item.id)).toEqual([
      "verification.visual.failed",
      "verification.interaction.skipped",
    ]);
  });

  it("rejects stale verification evidence from another commit SHA", () => {
    expect(() =>
      evaluateV3ReleaseCandidateEvidence({
        candidateSha: SHA,
        target: "limited",
        workflows: ["confirmation"],
        verification: [
          verification("functional"),
          verification("visual"),
          verification("interaction"),
          verification("infrastructure", "passed", OLD_SHA),
        ],
        workflowDecisions: [decision("confirmation", "limited")],
        observability: observability("limited"),
      }),
    ).toThrow(/belongs to candidate/);
  });

  it("rejects a cutover decision from another candidate even when it was allowed", () => {
    expect(() =>
      evaluateV3ReleaseCandidateEvidence({
        candidateSha: SHA,
        target: "full",
        workflows: ["jury"],
        verification: allVerification,
        workflowDecisions: [decision("jury", "full", {}, OLD_SHA)],
        observability: observability("full"),
      }),
    ).toThrow(/belongs to candidate/);
  });

  it("does not reuse a shadow decision as evidence for limited rollout", () => {
    const result = evaluateV3ReleaseCandidateEvidence({
      candidateSha: SHA,
      target: "limited",
      workflows: ["entry"],
      verification: allVerification,
      workflowDecisions: [decision("entry", "shadow")],
      observability: observability("limited"),
    });

    expect(result.ready).toBe(false);
    expect(result.blockers[0]?.id).toBe("workflow.entry.wrong_stage");
  });

  it("propagates real workflow blockers instead of flattening them into a pass boolean", () => {
    const result = evaluateV3ReleaseCandidateEvidence({
      candidateSha: SHA,
      target: "limited",
      workflows: ["televote"],
      verification: allVerification,
      workflowDecisions: [
        decision("televote", "limited", {
          allowed: false,
          blockers: [
            {
              key: "duplicateEvidenceReconciliation",
              reason: "Duplicate evidence still requires canonical reconciliation.",
            },
          ],
        }),
      ],
      observability: observability("limited"),
    });

    expect(result.ready).toBe(false);
    expect(result.blockers).toContainEqual({
      id: "workflow.televote.blocked",
      reason: "Duplicate evidence still requires canonical reconciliation.",
    });
  });

  it("fails closed when an allowed workflow decision still contains blockers", () => {
    const result = evaluateV3ReleaseCandidateEvidence({
      candidateSha: SHA,
      target: "full",
      workflows: ["confirmation"],
      verification: allVerification,
      workflowDecisions: [
        decision("confirmation", "full", {
          allowed: true,
          blockers: [
            {
              key: "authoritativeReceipts",
              reason: "Receipt evidence is missing.",
            },
          ],
        }),
      ],
      observability: observability("full"),
    });

    expect(result.ready).toBe(false);
    expect(result.blockers[0]?.id).toBe(
      "workflow.confirmation.inconsistent_decision",
    );
  });

  it("requires observability before limited/full/retirement but not before entering shadow", () => {
    const limited = evaluateV3ReleaseCandidateEvidence({
      candidateSha: SHA,
      target: "limited",
      workflows: ["confirmation"],
      verification: allVerification,
      workflowDecisions: [decision("confirmation", "limited")],
    });
    expect(limited.ready).toBe(false);
    expect(limited.blockers[0]?.id).toBe("observability.missing");

    const shadow = evaluateV3ReleaseCandidateEvidence({
      candidateSha: SHA,
      target: "shadow",
      workflows: ["confirmation"],
      verification: [verification("infrastructure")],
      workflowDecisions: [decision("confirmation", "shadow")],
    });
    expect(shadow.ready).toBe(true);
  });

  it("requires observability evaluated for the exact promotion target", () => {
    const result = evaluateV3ReleaseCandidateEvidence({
      candidateSha: SHA,
      target: "full",
      workflows: ["jury"],
      verification: allVerification,
      workflowDecisions: [decision("jury", "full")],
      observability: observability("limited"),
    });

    expect(result.ready).toBe(false);
    expect(result.blockers[0]?.id).toBe("observability.wrong_target");
  });

  it("blocks when rollout observability says the candidate is not healthy enough", () => {
    const result = evaluateV3ReleaseCandidateEvidence({
      candidateSha: SHA,
      target: "full",
      workflows: ["jury"],
      verification: allVerification,
      workflowDecisions: [decision("jury", "full")],
      observability: observability("full", {
        ready: false,
        blockers: [
          { id: "no-unresolved-uncertain-operations", passed: false },
        ],
      }),
    });

    expect(result.ready).toBe(false);
    expect(result.blockers).toContainEqual({
      id: "observability.blocked",
      reason: "no-unresolved-uncertain-operations",
    });
  });

  it("rejects observability recorded before its evidence window ended", () => {
    expect(() =>
      evaluateV3ReleaseCandidateEvidence({
        candidateSha: SHA,
        target: "limited",
        workflows: ["confirmation"],
        verification: allVerification,
        workflowDecisions: [decision("confirmation", "limited")],
        observability: observability("limited", {
          windowEnd: "2026-10-12T05:00:00.000Z",
          observedAt: "2026-10-12T04:30:00.000Z",
        }),
      }),
    ).toThrow(/before its observation window ends/);
  });

  it("requires retirement-specific observability rather than reusing full-rollout evidence", () => {
    const result = evaluateV3ReleaseCandidateEvidence({
      candidateSha: SHA,
      target: "retire_legacy",
      workflows: ["confirmation"],
      verification: allVerification,
      workflowDecisions: [decision("confirmation", "retire_legacy")],
      observability: observability("full"),
    });

    expect(result.ready).toBe(false);
    expect(result.blockers[0]?.id).toBe("observability.wrong_target");
  });

  it("supports independently promoting only the workflows explicitly in this candidate scope", () => {
    const result = evaluateV3ReleaseCandidateEvidence({
      candidateSha: SHA,
      target: "limited",
      workflows: ["confirmation", "media"],
      verification: allVerification,
      workflowDecisions: [
        decision("confirmation", "limited"),
        decision("media", "limited"),
      ],
      observability: observability("limited"),
    });

    expect(result.ready).toBe(true);
    expect(result.workflows).toEqual(["confirmation", "media"]);
  });

  it("fails on ambiguous duplicate evidence instead of last-write-wins", () => {
    expect(() =>
      evaluateV3ReleaseCandidateEvidence({
        candidateSha: SHA,
        target: "shadow",
        workflows: ["confirmation"],
        verification: [
          verification("infrastructure"),
          verification("infrastructure"),
        ],
        workflowDecisions: [decision("confirmation", "shadow")],
      }),
    ).toThrow(/Duplicate infrastructure verification evidence/);

    expect(() =>
      evaluateV3ReleaseCandidateEvidence({
        candidateSha: SHA,
        target: "shadow",
        workflows: ["jury"],
        verification: [verification("infrastructure")],
        workflowDecisions: [
          decision("jury", "shadow"),
          decision("jury", "shadow"),
        ],
      }),
    ).toThrow(/Duplicate jury cutover decision evidence/);
  });

  it("requires a full commit SHA and at least one workflow", () => {
    expect(() =>
      evaluateV3ReleaseCandidateEvidence({
        candidateSha: "098b64c",
        target: "shadow",
        workflows: ["confirmation"],
        verification: [],
        workflowDecisions: [],
      }),
    ).toThrow(/full 40-character commit SHA/);

    expect(() =>
      evaluateV3ReleaseCandidateEvidence({
        candidateSha: SHA,
        target: "shadow",
        workflows: [],
        verification: [],
        workflowDecisions: [],
      }),
    ).toThrow(/at least one critical workflow/);
  });
});

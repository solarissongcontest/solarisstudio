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
const DEPLOYMENT = "deployment:production:sha:cloudflare-1:schema-1";
const OTHER_DEPLOYMENT = "deployment:production:sha:cloudflare-2:schema-2";
const OBSERVED_AT = "2026-10-12T04:30:00.000Z";

function verification(
  gate: V3VerificationGate,
  status: "passed" | "failed" | "skipped" = "passed",
  candidateSha = SHA,
  deploymentIdentityKey = DEPLOYMENT,
) {
  return {
    candidateSha,
    deploymentIdentityKey,
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
  deploymentIdentityKey = DEPLOYMENT,
) {
  return {
    candidateSha,
    deploymentIdentityKey,
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
    deploymentIdentityKey: string;
    ready: boolean;
    blockers: readonly { id: string; passed: boolean }[];
    windowStart: string;
    windowEnd: string;
    observedAt: string;
  }> = {},
) {
  return {
    candidateSha: overrides.candidateSha ?? SHA,
    deploymentIdentityKey: overrides.deploymentIdentityKey ?? DEPLOYMENT,
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

function evaluate(
  input: Omit<Parameters<typeof evaluateV3ReleaseCandidateEvidence>[0], "candidateSha" | "deploymentIdentityKey"> &
    Partial<Pick<Parameters<typeof evaluateV3ReleaseCandidateEvidence>[0], "candidateSha" | "deploymentIdentityKey">>,
) {
  return evaluateV3ReleaseCandidateEvidence({
    candidateSha: input.candidateSha ?? SHA,
    deploymentIdentityKey: input.deploymentIdentityKey ?? DEPLOYMENT,
    target: input.target,
    workflows: input.workflows,
    verification: input.verification,
    workflowDecisions: input.workflowDecisions,
    observability: input.observability,
  });
}

describe("Solaris Studio V3 release candidate evidence", () => {
  it("allows shadow with deployment-bound infrastructure proof and matching decisions", () => {
    const result = evaluate({
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
    expect(result.deploymentIdentityKey).toBe(DEPLOYMENT);
  });

  it("requires all four verification gates for limited/full/retirement", () => {
    const result = evaluate({
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

  it("does not accept failed or skipped verification", () => {
    const result = evaluate({
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
    expect(result.blockers.map((item) => item.id)).toEqual([
      "verification.visual.failed",
      "verification.interaction.skipped",
    ]);
  });

  it("rejects stale verification from another commit SHA", () => {
    expect(() =>
      evaluate({
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

  it("rejects same-SHA verification from another deployment/schema identity", () => {
    expect(() =>
      evaluate({
        target: "limited",
        workflows: ["confirmation"],
        verification: [
          verification("functional"),
          verification("visual"),
          verification("interaction"),
          verification(
            "infrastructure",
            "passed",
            SHA,
            OTHER_DEPLOYMENT,
          ),
        ],
        workflowDecisions: [decision("confirmation", "limited")],
        observability: observability("limited"),
      }),
    ).toThrow(/different deployment identity/);
  });

  it("rejects cutover or observability evidence from another deployment", () => {
    expect(() =>
      evaluate({
        target: "full",
        workflows: ["jury"],
        verification: allVerification,
        workflowDecisions: [
          decision("jury", "full", {}, SHA, OTHER_DEPLOYMENT),
        ],
        observability: observability("full"),
      }),
    ).toThrow(/different deployment identity/);

    expect(() =>
      evaluate({
        target: "full",
        workflows: ["jury"],
        verification: allVerification,
        workflowDecisions: [decision("jury", "full")],
        observability: observability("full", {
          deploymentIdentityKey: OTHER_DEPLOYMENT,
        }),
      }),
    ).toThrow(/different deployment identity/);
  });

  it("does not reuse a shadow decision as evidence for limited rollout", () => {
    const result = evaluate({
      target: "limited",
      workflows: ["entry"],
      verification: allVerification,
      workflowDecisions: [decision("entry", "shadow")],
      observability: observability("limited"),
    });
    expect(result.blockers[0]?.id).toBe("workflow.entry.wrong_stage");
  });

  it("propagates real workflow blockers and rejects inconsistent allowed decisions", () => {
    const blocked = evaluate({
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
    expect(blocked.blockers).toContainEqual({
      id: "workflow.televote.blocked",
      reason: "Duplicate evidence still requires canonical reconciliation.",
    });

    const inconsistent = evaluate({
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
    expect(inconsistent.blockers[0]?.id).toBe(
      "workflow.confirmation.inconsistent_decision",
    );
  });

  it("requires observability for limited/full/retirement but not initial shadow", () => {
    const limited = evaluate({
      target: "limited",
      workflows: ["confirmation"],
      verification: allVerification,
      workflowDecisions: [decision("confirmation", "limited")],
    });
    expect(limited.blockers[0]?.id).toBe("observability.missing");

    const shadow = evaluate({
      target: "shadow",
      workflows: ["confirmation"],
      verification: [verification("infrastructure")],
      workflowDecisions: [decision("confirmation", "shadow")],
    });
    expect(shadow.ready).toBe(true);
  });

  it("requires observability evaluated for the exact promotion target", () => {
    const result = evaluate({
      target: "full",
      workflows: ["jury"],
      verification: allVerification,
      workflowDecisions: [decision("jury", "full")],
      observability: observability("limited"),
    });
    expect(result.blockers[0]?.id).toBe("observability.wrong_target");
  });

  it("blocks unhealthy observability and impossible observation chronology", () => {
    const unhealthy = evaluate({
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
    expect(unhealthy.blockers[0]?.id).toBe("observability.blocked");

    expect(() =>
      evaluate({
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

  it("requires retirement-specific observability", () => {
    const result = evaluate({
      target: "retire_legacy",
      workflows: ["confirmation"],
      verification: allVerification,
      workflowDecisions: [decision("confirmation", "retire_legacy")],
      observability: observability("full"),
    });
    expect(result.blockers[0]?.id).toBe("observability.wrong_target");
  });

  it("supports independently promoting only explicitly scoped workflows", () => {
    const result = evaluate({
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

  it("fails on duplicate evidence instead of last-write-wins", () => {
    expect(() =>
      evaluate({
        target: "shadow",
        workflows: ["confirmation"],
        verification: [
          verification("infrastructure"),
          verification("infrastructure"),
        ],
        workflowDecisions: [decision("confirmation", "shadow")],
      }),
    ).toThrow(/Duplicate infrastructure verification evidence/);
  });

  it("requires full SHA, deployment identity and at least one workflow", () => {
    expect(() =>
      evaluate({
        candidateSha: "098b64c",
        target: "shadow",
        workflows: ["confirmation"],
        verification: [],
        workflowDecisions: [],
      }),
    ).toThrow(/full 40-character commit SHA/);

    expect(() =>
      evaluate({
        deploymentIdentityKey: "   ",
        target: "shadow",
        workflows: ["confirmation"],
        verification: [],
        workflowDecisions: [],
      }),
    ).toThrow(/requires a deployment identity key/);

    expect(() =>
      evaluate({
        target: "shadow",
        workflows: [],
        verification: [],
        workflowDecisions: [],
      }),
    ).toThrow(/at least one critical workflow/);
  });
});

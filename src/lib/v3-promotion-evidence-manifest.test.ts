import { describe, expect, it } from "vitest";

import type {
  V3CandidateVerificationEvidence,
  V3CandidateWorkflowDecisionEvidence,
} from "./v3-release-candidate-evidence";
import type { V3PromotionObservationEvidence } from "./v3-promotion-observation-epoch";
import {
  applyV3PromotionEvidenceManifest,
  evaluateV3PromotionEvidenceManifest,
  type V3PromotionEvidenceManifest,
} from "./v3-promotion-evidence-manifest";
import type { V3RolloutStateLedger } from "./v3-rollout-state-ledger";

const SHA = "1234567890abcdef1234567890abcdef12345678";
const OTHER_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const RUNTIME = "runtime:production:sha-a:deploy-1:schema-1:policy-1";
const OBSERVED = "2026-10-12T05:00:00.000Z";
const ASSEMBLED = "2026-10-12T05:01:00.000Z";
const POLICY = {
  minShadowObservationMs: 60 * 60 * 1000,
  minLimitedObservationMs: 2 * 60 * 60 * 1000,
  minFullObservationMsBeforeRetirement: 24 * 60 * 60 * 1000,
};

function verification(
  gate: "functional" | "visual" | "interaction" | "infrastructure",
  status: "passed" | "failed" | "skipped" = "passed",
  candidateSha = SHA,
  observedAt = OBSERVED,
): V3CandidateVerificationEvidence {
  return {
    candidateSha,
    evidenceRef: `ci:${gate}:run-123`,
    observedAt,
    gate,
    status,
  };
}

function workflow(
  stage: "limited" | "full" | "retire_legacy" = "full",
  allowed = true,
  observedAt = OBSERVED,
): V3CandidateWorkflowDecisionEvidence {
  return {
    candidateSha: SHA,
    evidenceRef: `cutover:confirmation:${stage}:123`,
    observedAt,
    decision: {
      workflow: "confirmation",
      stage,
      allowed,
      blockers: allowed
        ? []
        : [
            {
              key: "authoritativeReceipts",
              reason: "Authoritative receipt evidence is missing.",
            },
          ],
    },
  };
}

function observation(
  target: "limited" | "full" | "retire_legacy" = "full",
  overrides: Partial<V3PromotionObservationEvidence> = {},
): V3PromotionObservationEvidence {
  const sourceStage =
    target === "limited" ? "shadow" : target === "full" ? "limited" : "full";
  return {
    candidateSha: SHA,
    runtimeIdentityKey: RUNTIME,
    evidenceRef: `telemetry:${target}:window-1`,
    observedAt: OBSERVED,
    windowStart: "2026-10-12T03:00:00.000Z",
    windowEnd: "2026-10-12T04:59:00.000Z",
    sourceStage,
    decision: {
      target,
      ready: true,
      blockers: [],
    },
    ...overrides,
  };
}

function manifest(
  target: "limited" | "full" | "retire_legacy" = "full",
  overrides: Partial<V3PromotionEvidenceManifest> = {},
): V3PromotionEvidenceManifest {
  return {
    manifestVersion: 1,
    manifestRef: `release-manifest:${target}:123`,
    assembledAt: ASSEMBLED,
    candidateSha: SHA,
    target,
    workflows: ["confirmation"],
    verification: [
      verification("functional"),
      verification("visual"),
      verification("interaction"),
      verification("infrastructure"),
    ],
    workflowDecisions: [workflow(target)],
    observation: observation(target),
    ...overrides,
  };
}

function ledger(
  stage: "shadow" | "limited" | "full" = "limited",
  enteredAt = "2026-10-12T03:00:00.000Z",
  revision = stage === "shadow" ? 1 : stage === "limited" ? 2 : 3,
): V3RolloutStateLedger {
  const from = stage === "shadow" ? "legacy" : stage === "limited" ? "shadow" : "limited";
  return {
    revision,
    state: {
      stage,
      candidateSha: SHA,
      runtimeIdentityKey: RUNTIME,
      enteredAt,
    },
    updatedAt: enteredAt,
    lastChange: {
      kind: "promotion",
      ref: `previous:${stage}:${revision}`,
      from,
      to: stage,
    },
  };
}

describe("Solaris Studio V3 promotion evidence manifest", () => {
  it("recomputes a ready #505 decision from the manifest components", () => {
    const result = evaluateV3PromotionEvidenceManifest({
      manifest: manifest("full"),
      to: "full",
    });

    expect(result.releaseDecision).toEqual({
      candidateSha: SHA,
      target: "full",
      workflows: ["confirmation"],
      ready: true,
      blockers: [],
    });
    expect(result.manifestRef).toBe("release-manifest:full:123");
  });

  it("cannot turn a failed Functional artifact into a ready promotion by naming the manifest optimistically", () => {
    const candidate = manifest("full", {
      manifestRef: "release-manifest:THIS-DEFINITELY-PASSED",
      verification: [
        verification("functional", "failed"),
        verification("visual"),
        verification("interaction"),
        verification("infrastructure"),
      ],
    });

    const result = evaluateV3PromotionEvidenceManifest({
      manifest: candidate,
      to: "full",
    });
    expect(result.releaseDecision.ready).toBe(false);
    expect(result.releaseDecision.blockers.map((item) => item.id)).toContain(
      "verification.functional.failed",
    );
  });

  it("recomputes workflow blockers instead of trusting a detached release reference", () => {
    const candidate = manifest("full", {
      workflowDecisions: [workflow("full", false)],
    });
    const result = evaluateV3PromotionEvidenceManifest({
      manifest: candidate,
      to: "full",
    });

    expect(result.releaseDecision.ready).toBe(false);
    expect(result.releaseDecision.blockers).toContainEqual({
      id: "workflow.confirmation.blocked",
      reason: "Authoritative receipt evidence is missing.",
    });
  });

  it("rejects component evidence from another candidate SHA", () => {
    const candidate = manifest("full", {
      verification: [
        verification("functional"),
        verification("visual"),
        verification("interaction"),
        verification("infrastructure", "passed", OTHER_SHA),
      ],
    });

    expect(() =>
      evaluateV3PromotionEvidenceManifest({ manifest: candidate, to: "full" }),
    ).toThrow(/belongs to candidate/);
  });

  it("rejects a manifest being reinterpreted for another promotion target", () => {
    expect(() =>
      evaluateV3PromotionEvidenceManifest({
        manifest: manifest("limited"),
        to: "full",
      }),
    ).toThrow(/targets limited, not full/);
  });

  it("requires the manifest to be assembled after every component artifact existed", () => {
    const lateVerification = manifest("full", {
      verification: [
        verification("functional", "passed", SHA, "2026-10-12T05:02:00.000Z"),
        verification("visual"),
        verification("interaction"),
        verification("infrastructure"),
      ],
    });
    expect(() =>
      evaluateV3PromotionEvidenceManifest({
        manifest: lateVerification,
        to: "full",
      }),
    ).toThrow(/assembled before functional verification evidence existed/);

    const lateObservation = manifest("full", {
      observation: observation("full", {
        observedAt: "2026-10-12T05:02:00.000Z",
      }),
    });
    expect(() =>
      evaluateV3PromotionEvidenceManifest({
        manifest: lateObservation,
        to: "full",
      }),
    ).toThrow(/assembled before its observability evidence existed/);
  });

  it("applies a valid full promotion using the freshly recomputed decision", () => {
    const current = ledger("limited");
    const result = applyV3PromotionEvidenceManifest({
      current,
      expectedRevision: current.revision,
      to: "full",
      manifest: manifest("full"),
      runtimeIdentityKey: RUNTIME,
      policy: POLICY,
      serverTime: "2026-10-12T05:02:00.000Z",
    });

    expect(result.status).toBe("applied");
    if (result.status !== "applied") return;
    expect(result.record.revision).toBe(3);
    expect(result.record.state.stage).toBe("full");
    expect(result.record.lastChange?.ref).toContain("release-manifest:full:123");
    expect(result.record.lastChange?.ref).toContain("telemetry:full:window-1");
  });

  it("keeps blocked recomputed evidence read-only", () => {
    const current = ledger("limited");
    const blockedManifest = manifest("full", {
      verification: [
        verification("functional", "failed"),
        verification("visual"),
        verification("interaction"),
        verification("infrastructure"),
      ],
    });

    const result = applyV3PromotionEvidenceManifest({
      current,
      expectedRevision: current.revision,
      to: "full",
      manifest: blockedManifest,
      runtimeIdentityKey: RUNTIME,
      policy: POLICY,
      serverTime: "2026-10-12T05:02:00.000Z",
    });

    expect(result.status).toBe("blocked");
    expect(result.record).toEqual(current);
  });

  it("still delegates current-stage observation epoch failures to #511", () => {
    const current = ledger("limited", "2026-10-12T04:00:00.000Z");
    const oldEpochManifest = manifest("full", {
      observation: observation("full", {
        windowStart: "2026-10-12T03:00:00.000Z",
      }),
    });

    const result = applyV3PromotionEvidenceManifest({
      current,
      expectedRevision: current.revision,
      to: "full",
      manifest: oldEpochManifest,
      runtimeIdentityKey: RUNTIME,
      policy: POLICY,
      serverTime: "2026-10-12T06:30:00.000Z",
    });

    expect(result.status).toBe("observation_blocked");
    if (result.status !== "observation_blocked") return;
    expect(result.observationDecision.blockers.map((item) => item.id)).toContain(
      "window_predates_stage_epoch",
    );
    expect(result.record).toEqual(current);
  });

  it("rejects a manifest assembled after authoritative promotion time", () => {
    const current = ledger("limited");
    expect(() =>
      applyV3PromotionEvidenceManifest({
        current,
        expectedRevision: current.revision,
        to: "full",
        manifest: manifest("full", {
          assembledAt: "2026-10-12T05:10:00.000Z",
        }),
        runtimeIdentityKey: RUNTIME,
        policy: POLICY,
        serverTime: "2026-10-12T05:09:59.999Z",
      }),
    ).toThrow(/cannot be assembled after promotion server time/);
  });

  it("requires a supported manifest version and durable manifest reference", () => {
    expect(() =>
      evaluateV3PromotionEvidenceManifest({
        manifest: { ...manifest("full"), manifestVersion: 2 as 1 },
        to: "full",
      }),
    ).toThrow(/Unsupported V3 promotion evidence manifest version/);

    expect(() =>
      evaluateV3PromotionEvidenceManifest({
        manifest: { ...manifest("full"), manifestRef: "   " },
        to: "full",
      }),
    ).toThrow(/manifestRef must not be empty/);
  });
});

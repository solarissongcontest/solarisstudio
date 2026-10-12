import { describe, expect, it } from "vitest";

import type { V3ReleaseCandidateDecision } from "./v3-release-candidate-evidence";
import {
  applyV3ObservedRolloutPromotion,
  createV3PromotionEvidenceBundleRef,
  evaluateV3PromotionObservationEpoch,
  type V3PromotionObservationEvidence,
} from "./v3-promotion-observation-epoch";
import type { V3RolloutStateLedger } from "./v3-rollout-state-ledger";

const SHA = "1234567890abcdef1234567890abcdef12345678";
const OTHER_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DEPLOYMENT = "deployment:production:sha-a:cloudflare-1:schema-1";
const OTHER_DEPLOYMENT = "deployment:production:sha-a:cloudflare-2:schema-1";
const OBSERVATION = "observation:deployment-1:policy-2026-10-12T02:00Z";
const POLICY = {
  minShadowObservationMs: 60 * 60 * 1000,
  minLimitedObservationMs: 2 * 60 * 60 * 1000,
  minFullObservationMsBeforeRetirement: 24 * 60 * 60 * 1000,
};

function releaseEvidence(
  target: V3ReleaseCandidateDecision["target"],
  overrides: Partial<V3ReleaseCandidateDecision> = {},
): V3ReleaseCandidateDecision {
  return {
    candidateSha: SHA,
    target,
    workflows: ["confirmation"],
    ready: true,
    blockers: [],
    ...overrides,
  };
}

function ledger(
  stage: "shadow" | "limited" | "full",
  enteredAt: string,
  revision: number,
  changeKind: "promotion" | "observation_epoch_reset" = "promotion",
): V3RolloutStateLedger {
  const from =
    changeKind === "observation_epoch_reset"
      ? stage
      : stage === "shadow"
        ? "legacy"
        : stage === "limited"
          ? "shadow"
          : "limited";
  return {
    revision,
    state: {
      stage,
      candidateSha: SHA,
      deploymentIdentityKey: DEPLOYMENT,
      enteredAt,
    },
    updatedAt: enteredAt,
    lastChange: {
      kind: changeKind,
      ref: `${changeKind}:${stage}:${revision}`,
      from,
      to: stage,
    },
  };
}

function observation(
  target: "limited" | "full" | "retire_legacy",
  sourceStage: "shadow" | "limited" | "full",
  overrides: Partial<V3PromotionObservationEvidence> = {},
): V3PromotionObservationEvidence {
  return {
    candidateSha: SHA,
    deploymentIdentityKey: DEPLOYMENT,
    observationIdentityKey: OBSERVATION,
    evidenceRef: `observability:${target}:epoch`,
    observedAt: "2026-10-12T05:00:01.000Z",
    windowStart: "2026-10-12T02:00:00.000Z",
    windowEnd: "2026-10-12T05:00:00.000Z",
    sourceStage,
    decision: {
      target,
      ready: true,
      blockers: [],
    },
    ...overrides,
  };
}

describe("Solaris Studio V3 promotion observation epoch", () => {
  it("accepts full-promotion evidence collected entirely inside the current limited epoch", () => {
    const current = ledger("limited", "2026-10-12T02:00:00.000Z", 2);
    expect(
      evaluateV3PromotionObservationEpoch({
        current,
        to: "full",
        observation: observation("full", "limited"),
        serverTime: "2026-10-12T05:00:02.000Z",
      }),
    ).toEqual({ allowed: true, blockers: [] });
  });

  it("blocks telemetry whose window started before the current stage epoch", () => {
    const current = ledger("limited", "2026-10-12T03:00:00.000Z", 4);
    const decision = evaluateV3PromotionObservationEpoch({
      current,
      to: "full",
      observation: observation("full", "limited", {
        windowStart: "2026-10-12T02:00:00.000Z",
      }),
      serverTime: "2026-10-12T06:00:00.000Z",
    });
    expect(decision.blockers.map((item) => item.id)).toContain(
      "window_predates_stage_epoch",
    );
  });

  it("invalidates pre-policy-change telemetry after a same-stage observation epoch reset", () => {
    const resetLimited = ledger(
      "limited",
      "2026-10-12T08:00:00.000Z",
      6,
      "observation_epoch_reset",
    );
    const oldPolicyEvidence = observation("full", "limited", {
      observationIdentityKey: "observation:deployment-1:old-policy",
      windowStart: "2026-10-12T04:00:00.000Z",
      windowEnd: "2026-10-12T07:00:00.000Z",
      observedAt: "2026-10-12T07:00:01.000Z",
    });
    const decision = evaluateV3PromotionObservationEpoch({
      current: resetLimited,
      to: "full",
      observation: oldPolicyEvidence,
      serverTime: "2026-10-12T10:00:00.000Z",
    });
    expect(decision.blockers.map((item) => item.id)).toContain(
      "window_predates_stage_epoch",
    );
  });

  it("requires exact candidate and stable deployment identity", () => {
    const current = ledger("shadow", "2026-10-12T02:00:00.000Z", 1);
    const wrongCandidate = evaluateV3PromotionObservationEpoch({
      current,
      to: "limited",
      observation: observation("limited", "shadow", {
        candidateSha: OTHER_SHA,
      }),
      serverTime: "2026-10-12T05:00:02.000Z",
    });
    expect(wrongCandidate.blockers.map((item) => item.id)).toContain(
      "candidate_mismatch",
    );

    const wrongDeployment = evaluateV3PromotionObservationEpoch({
      current,
      to: "limited",
      observation: observation("limited", "shadow", {
        deploymentIdentityKey: OTHER_DEPLOYMENT,
      }),
      serverTime: "2026-10-12T05:00:02.000Z",
    });
    expect(wrongDeployment.blockers.map((item) => item.id)).toContain(
      "deployment_mismatch",
    );
  });

  it("requires a non-empty policy-specific observation identity", () => {
    const current = ledger("limited", "2026-10-12T02:00:00.000Z", 2);
    expect(() =>
      evaluateV3PromotionObservationEpoch({
        current,
        to: "full",
        observation: observation("full", "limited", {
          observationIdentityKey: "   ",
        }),
        serverTime: "2026-10-12T05:00:02.000Z",
      }),
    ).toThrow(/observation\.observationIdentityKey must not be empty/);
  });

  it("requires observation source stage and promotion target to match", () => {
    const current = ledger("limited", "2026-10-12T02:00:00.000Z", 2);
    const wrong = evaluateV3PromotionObservationEpoch({
      current,
      to: "full",
      observation: observation("limited", "shadow"),
      serverTime: "2026-10-12T05:00:02.000Z",
    });
    expect(wrong.blockers.map((item) => item.id)).toEqual(
      expect.arrayContaining(["wrong_source_stage", "wrong_observation_target"]),
    );
  });

  it("blocks unhealthy/inconsistent observability and future evidence", () => {
    const current = ledger("limited", "2026-10-12T02:00:00.000Z", 2);
    const unhealthy = evaluateV3PromotionObservationEpoch({
      current,
      to: "full",
      observation: observation("full", "limited", {
        decision: {
          target: "full",
          ready: false,
          blockers: [{ id: "runtime-errors", passed: false }],
        },
      }),
      serverTime: "2026-10-12T05:00:02.000Z",
    });
    expect(unhealthy.blockers.map((item) => item.id)).toContain(
      "observation_not_ready",
    );

    const future = evaluateV3PromotionObservationEpoch({
      current,
      to: "full",
      observation: observation("full", "limited", {
        windowEnd: "2026-10-12T06:00:00.000Z",
        observedAt: "2026-10-12T06:00:01.000Z",
      }),
      serverTime: "2026-10-12T05:00:00.000Z",
    });
    expect(future.blockers.map((item) => item.id)).toEqual(
      expect.arrayContaining(["window_ends_in_future", "evidence_observed_in_future"]),
    );
  });

  it("creates an unambiguous bundle reference for release + observation evidence", () => {
    const first = createV3PromotionEvidenceBundleRef({
      releaseEvidenceRef: "ab|c",
      observationEvidenceRef: "d",
    });
    const second = createV3PromotionEvidenceBundleRef({
      releaseEvidenceRef: "ab",
      observationEvidenceRef: "c|d",
    });
    expect(first).not.toBe(second);
  });

  it("applies a valid observed promotion through the #509 ledger transition", () => {
    const current = ledger("limited", "2026-10-12T02:00:00.000Z", 2);
    const result = applyV3ObservedRolloutPromotion({
      current,
      expectedRevision: 2,
      to: "full",
      releaseEvidence: releaseEvidence("full"),
      releaseEvidenceRef: "release-manifest:full:sha",
      observation: observation("full", "limited"),
      deploymentIdentityKey: DEPLOYMENT,
      policy: POLICY,
      serverTime: "2026-10-12T05:00:02.000Z",
    });
    expect(result.status).toBe("applied");
    if (result.status !== "applied") return;
    expect(result.record.revision).toBe(3);
    expect(result.record.state.stage).toBe("full");
    expect(result.record.lastChange?.ref).toContain("release-manifest:full:sha");
    expect(result.record.lastChange?.ref).toContain("observability:full:epoch");
  });

  it("keeps #509 stale-revision and blocked-promotion authority ahead of observation evaluation", () => {
    const current = ledger("limited", "2026-10-12T02:00:00.000Z", 2);
    const stale = applyV3ObservedRolloutPromotion({
      current,
      expectedRevision: 1,
      to: "full",
      releaseEvidence: releaseEvidence("full"),
      releaseEvidenceRef: "release-manifest:full:sha",
      observation: observation("full", "limited", { windowStart: "not-a-time" }),
      deploymentIdentityKey: DEPLOYMENT,
      policy: POLICY,
      serverTime: "2026-10-12T05:00:02.000Z",
    });
    expect(stale).toEqual({ status: "stale_revision", record: current });

    const blocked = applyV3ObservedRolloutPromotion({
      current,
      expectedRevision: 2,
      to: "full",
      releaseEvidence: releaseEvidence("full", {
        ready: false,
        blockers: [{ id: "functional", reason: "Functional gate failed." }],
      }),
      releaseEvidenceRef: "release-manifest:blocked",
      observation: observation("full", "limited"),
      deploymentIdentityKey: DEPLOYMENT,
      policy: POLICY,
      serverTime: "2026-10-12T05:00:02.000Z",
    });
    expect(blocked.status).toBe("blocked");
    expect(blocked.record).toEqual(current);
  });

  it("returns observation_blocked without committing the simulated transition", () => {
    const current = ledger("limited", "2026-10-12T03:00:00.000Z", 2);
    const result = applyV3ObservedRolloutPromotion({
      current,
      expectedRevision: 2,
      to: "full",
      releaseEvidence: releaseEvidence("full"),
      releaseEvidenceRef: "release-manifest:full:sha",
      observation: observation("full", "limited", {
        windowStart: "2026-10-12T02:00:00.000Z",
      }),
      deploymentIdentityKey: DEPLOYMENT,
      policy: POLICY,
      serverTime: "2026-10-12T06:00:00.000Z",
    });
    expect(result.status).toBe("observation_blocked");
    if (result.status !== "observation_blocked") return;
    expect(result.record).toBe(current);
    expect(result.observationDecision.blockers.map((item) => item.id)).toContain(
      "window_predates_stage_epoch",
    );
  });
});

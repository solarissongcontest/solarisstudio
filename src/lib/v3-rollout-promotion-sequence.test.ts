import { describe, expect, it } from "vitest";

import type { V3ReleaseCandidateDecision } from "./v3-release-candidate-evidence";
import {
  createV3LegacyRolloutState,
  evaluateV3RolloutTransition,
  rollbackV3Rollout,
  type V3RolloutPromotionPolicy,
  type V3RolloutState,
} from "./v3-rollout-promotion-sequence";

const SHA_A = "1234567890abcdef1234567890abcdef12345678";
const SHA_B = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DEPLOYMENT_A = "deployment:production:sha-a:cloudflare-1:schema-1";
const DEPLOYMENT_B = "deployment:production:sha-a:cloudflare-2:schema-1";
const POLICY: V3RolloutPromotionPolicy = {
  minShadowObservationMs: 60 * 60 * 1000,
  minLimitedObservationMs: 2 * 60 * 60 * 1000,
  minFullObservationMsBeforeRetirement: 24 * 60 * 60 * 1000,
};

function evidence(
  candidateSha: string,
  target: V3ReleaseCandidateDecision["target"],
  overrides: Partial<V3ReleaseCandidateDecision> = {},
): V3ReleaseCandidateDecision {
  return {
    candidateSha,
    target,
    workflows: ["confirmation"],
    ready: true,
    blockers: [],
    ...overrides,
  };
}

function active(
  stage: Exclude<V3RolloutState["stage"], "legacy">,
  enteredAt: string,
  candidateSha = SHA_A,
  deploymentIdentityKey = DEPLOYMENT_A,
): V3RolloutState {
  return { stage, candidateSha, deploymentIdentityKey, enteredAt };
}

function transition(
  current: V3RolloutState,
  to: "shadow" | "limited" | "full" | "retired",
  target: V3ReleaseCandidateDecision["target"],
  now: string,
  options: {
    candidateSha?: string;
    deploymentIdentityKey?: string;
    evidenceOverrides?: Partial<V3ReleaseCandidateDecision>;
  } = {},
) {
  const candidateSha = options.candidateSha ?? SHA_A;
  return evaluateV3RolloutTransition({
    current,
    to,
    evidence: evidence(candidateSha, target, options.evidenceOverrides),
    deploymentIdentityKey: options.deploymentIdentityKey ?? DEPLOYMENT_A,
    policy: POLICY,
    now,
  });
}

describe("Solaris Studio V3 rollout promotion sequence", () => {
  it("starts a proven deployment at shadow from legacy", () => {
    const result = transition(
      createV3LegacyRolloutState("2026-10-12T00:00:00.000Z"),
      "shadow",
      "shadow",
      "2026-10-12T00:05:00.000Z",
    );
    expect(result.allowed).toBe(true);
    expect(result.kind).toBe("promotion");
    expect(result.nextState).toEqual({
      stage: "shadow",
      candidateSha: SHA_A,
      deploymentIdentityKey: DEPLOYMENT_A,
      enteredAt: "2026-10-12T00:05:00.000Z",
    });
  });

  it("does not let a deployment skip directly from shadow to full", () => {
    const result = transition(
      active("shadow", "2026-10-12T00:00:00.000Z"),
      "full",
      "full",
      "2026-10-12T06:00:00.000Z",
    );
    expect(result.allowed).toBe(false);
    expect(result.blockers.map((item) => item.id)).toContain(
      "non_sequential_promotion",
    );
  });

  it("requires configured shadow and limited observation windows", () => {
    const tooEarly = transition(
      active("shadow", "2026-10-12T00:00:00.000Z"),
      "limited",
      "limited",
      "2026-10-12T00:59:59.999Z",
    );
    expect(tooEarly.allowed).toBe(false);
    expect(tooEarly.blockers[0]?.id).toBe("observation_window_incomplete");

    const limited = transition(
      active("shadow", "2026-10-12T00:00:00.000Z"),
      "limited",
      "limited",
      "2026-10-12T01:00:00.000Z",
    );
    expect(limited.allowed).toBe(true);

    const fullTooEarly = transition(
      active("limited", "2026-10-12T01:00:00.000Z"),
      "full",
      "full",
      "2026-10-12T02:30:00.000Z",
    );
    expect(fullTooEarly.allowed).toBe(false);
    expect(fullTooEarly.requiredObservationMs).toBe(
      POLICY.minLimitedObservationMs,
    );
  });

  it("requires full-stage soak plus retirement evidence before legacy removal", () => {
    const tooEarly = transition(
      active("full", "2026-10-12T00:00:00.000Z"),
      "retired",
      "retire_legacy",
      "2026-10-12T23:59:59.999Z",
    );
    expect(tooEarly.allowed).toBe(false);

    const ready = transition(
      active("full", "2026-10-12T00:00:00.000Z"),
      "retired",
      "retire_legacy",
      "2026-10-13T00:00:00.000Z",
    );
    expect(ready.allowed).toBe(true);
    expect(ready.nextState?.stage).toBe("retired");
  });

  it("forces a new code SHA to restart at shadow", () => {
    const blocked = transition(
      active("full", "2026-10-12T00:00:00.000Z"),
      "full",
      "full",
      "2026-10-14T00:00:00.000Z",
      { candidateSha: SHA_B, deploymentIdentityKey: "deployment:sha-b" },
    );
    expect(blocked.allowed).toBe(false);
    expect(blocked.kind).toBe("deployment_restart");
    expect(blocked.blockers.map((item) => item.id)).toContain(
      "deployment_changed_restart_shadow",
    );
  });

  it("forces the same SHA under another deployment/schema identity to restart at shadow", () => {
    const blocked = transition(
      active("full", "2026-10-12T00:00:00.000Z", SHA_A, DEPLOYMENT_A),
      "full",
      "full",
      "2026-10-14T00:00:00.000Z",
      { deploymentIdentityKey: DEPLOYMENT_B },
    );
    expect(blocked.allowed).toBe(false);
    expect(blocked.kind).toBe("deployment_restart");
    expect(blocked.blockers[0]?.id).toBe("deployment_changed_restart_shadow");

    const restart = transition(
      active("full", "2026-10-12T00:00:00.000Z", SHA_A, DEPLOYMENT_A),
      "shadow",
      "shadow",
      "2026-10-14T00:00:00.000Z",
      { deploymentIdentityKey: DEPLOYMENT_B },
    );
    expect(restart.allowed).toBe(true);
    expect(restart.nextState).toMatchObject({
      stage: "shadow",
      candidateSha: SHA_A,
      deploymentIdentityKey: DEPLOYMENT_B,
    });
  });

  it("does not restart merely because rollout policy evolved while deployment stayed the same", () => {
    const current = active(
      "shadow",
      "2026-10-12T00:00:00.000Z",
      SHA_A,
      DEPLOYMENT_A,
    );
    const limited = transition(
      current,
      "limited",
      "limited",
      "2026-10-12T01:00:00.000Z",
      { deploymentIdentityKey: DEPLOYMENT_A },
    );
    expect(limited.allowed).toBe(true);
    expect(limited.kind).toBe("promotion");
  });

  it("requires release evidence for the exact destination stage", () => {
    const result = transition(
      active("shadow", "2026-10-12T00:00:00.000Z"),
      "limited",
      "shadow",
      "2026-10-12T02:00:00.000Z",
    );
    expect(result.allowed).toBe(false);
    expect(result.blockers.map((item) => item.id)).toContain(
      "evidence_wrong_stage",
    );
  });

  it("propagates blocked release evidence", () => {
    const result = transition(
      active("limited", "2026-10-12T00:00:00.000Z"),
      "full",
      "full",
      "2026-10-12T03:00:00.000Z",
      {
        evidenceOverrides: {
          ready: false,
          blockers: [
            { id: "observability.blocked", reason: "Runtime errors too high." },
          ],
        },
      },
    );
    expect(result.blockers).toContainEqual({
      id: "release_evidence_blocked",
      reason: "Runtime errors too high.",
    });
  });

  it("rolls exposure back immediately while preserving active deployment identity", () => {
    const rolledBack = rollbackV3Rollout({
      current: active("full", "2026-10-12T03:00:00.000Z"),
      to: "limited",
      now: "2026-10-12T03:00:01.000Z",
    });
    expect(rolledBack).toEqual({
      stage: "limited",
      candidateSha: SHA_A,
      deploymentIdentityKey: DEPLOYMENT_A,
      enteredAt: "2026-10-12T03:00:01.000Z",
    });

    const legacy = rollbackV3Rollout({
      current: rolledBack,
      to: "legacy",
      now: "2026-10-12T03:00:02.000Z",
    });
    expect(legacy).toEqual({
      stage: "legacy",
      candidateSha: null,
      deploymentIdentityKey: null,
      enteredAt: "2026-10-12T03:00:02.000Z",
    });
  });

  it("does not pretend retired legacy is still a staged rollback path", () => {
    expect(() =>
      rollbackV3Rollout({
        current: active("retired", "2026-10-13T00:00:00.000Z"),
        to: "legacy",
        now: "2026-10-13T00:01:00.000Z",
      }),
    ).toThrow(/cannot be restored through staged-rollout rollback/);
  });

  it("rejects invalid deployment identity, policy and backwards server time", () => {
    expect(() =>
      transition(
        active("shadow", "2026-10-12T01:00:00.000Z"),
        "limited",
        "limited",
        "2026-10-12T02:00:00.000Z",
        { deploymentIdentityKey: "   " },
      ),
    ).toThrow(/deploymentIdentityKey must not be empty/);

    expect(() =>
      evaluateV3RolloutTransition({
        current: active("shadow", "2026-10-12T01:00:00.000Z"),
        to: "limited",
        evidence: evidence(SHA_A, "limited"),
        deploymentIdentityKey: DEPLOYMENT_A,
        policy: { ...POLICY, minShadowObservationMs: -1 },
        now: "2026-10-12T02:00:00.000Z",
      }),
    ).toThrow(/non-negative safe integer/);

    expect(() =>
      transition(
        active("shadow", "2026-10-12T02:00:00.000Z"),
        "limited",
        "limited",
        "2026-10-12T01:59:59.000Z",
      ),
    ).toThrow(/cannot be before/);
  });
});

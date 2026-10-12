import { describe, expect, it } from "vitest";

import type { V3ReleaseCandidateDecision } from "./v3-release-candidate-evidence";
import {
  applyV3RolloutObservationEpochReset,
  applyV3RolloutPromotion,
  applyV3RolloutRollback,
  createV3RolloutStateLedger,
  type V3RolloutStateLedger,
} from "./v3-rollout-state-ledger";

const SHA = "1234567890abcdef1234567890abcdef12345678";
const DEPLOYMENT_A = "deployment:production:sha-a:cloudflare-1:schema-1";
const DEPLOYMENT_B = "deployment:production:sha-a:cloudflare-2:schema-1";
const POLICY = {
  minShadowObservationMs: 60 * 60 * 1000,
  minLimitedObservationMs: 2 * 60 * 60 * 1000,
  minFullObservationMsBeforeRetirement: 24 * 60 * 60 * 1000,
};

function evidence(
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

function promote(
  current: V3RolloutStateLedger,
  to: "shadow" | "limited" | "full" | "retired",
  target: V3ReleaseCandidateDecision["target"],
  serverTime: string,
  options: {
    expectedRevision?: number;
    deploymentIdentityKey?: string;
    evidenceOverrides?: Partial<V3ReleaseCandidateDecision>;
  } = {},
) {
  return applyV3RolloutPromotion({
    current,
    expectedRevision: options.expectedRevision ?? current.revision,
    to,
    evidence: evidence(target, options.evidenceOverrides),
    deploymentIdentityKey: options.deploymentIdentityKey ?? DEPLOYMENT_A,
    policy: POLICY,
    evidenceRef: `release-evidence:${target}:${current.revision + 1}`,
    serverTime,
  });
}

function applied(
  result: ReturnType<typeof applyV3RolloutPromotion>,
): V3RolloutStateLedger {
  if (result.status !== "applied") throw new Error(`Expected applied, got ${result.status}`);
  return result.record;
}

function fullLedger(): V3RolloutStateLedger {
  return {
    revision: 3,
    state: {
      stage: "full",
      candidateSha: SHA,
      deploymentIdentityKey: DEPLOYMENT_A,
      enteredAt: "2026-10-12T03:00:00.000Z",
    },
    updatedAt: "2026-10-12T03:00:00.000Z",
    lastChange: {
      kind: "promotion",
      ref: "release-evidence:full:3",
      from: "limited",
      to: "full",
    },
  };
}

describe("Solaris Studio V3 rollout state ledger", () => {
  it("starts as pristine revision-0 legacy state", () => {
    expect(createV3RolloutStateLedger("2026-10-12T00:00:00.000Z")).toEqual({
      revision: 0,
      state: {
        stage: "legacy",
        candidateSha: null,
        deploymentIdentityKey: null,
        enteredAt: "2026-10-12T00:00:00.000Z",
      },
      updatedAt: "2026-10-12T00:00:00.000Z",
      lastChange: null,
    });
  });

  it("projects a permitted legacy-to-shadow transition into revision 1", () => {
    const initial = createV3RolloutStateLedger("2026-10-12T00:00:00.000Z");
    const result = promote(initial, "shadow", "shadow", "2026-10-12T00:01:00.000Z");
    expect(result.status).toBe("applied");
    if (result.status !== "applied") return;
    expect(result.record).toMatchObject({
      revision: 1,
      state: {
        stage: "shadow",
        candidateSha: SHA,
        deploymentIdentityKey: DEPLOYMENT_A,
        enteredAt: "2026-10-12T00:01:00.000Z",
      },
    });
  });

  it("rejects stale concurrent writes and old-revision replay", () => {
    const initial = createV3RolloutStateLedger("2026-10-12T00:00:00.000Z");
    const shadow = applied(promote(initial, "shadow", "shadow", "2026-10-12T00:01:00.000Z"));
    const stale = promote(shadow, "limited", "limited", "2026-10-12T02:00:00.000Z", {
      expectedRevision: 0,
    });
    expect(stale).toEqual({ status: "stale_revision", record: shadow });
  });

  it("keeps blocked promotion evidence read-only", () => {
    const initial = createV3RolloutStateLedger("2026-10-12T00:00:00.000Z");
    const result = promote(initial, "shadow", "shadow", "2026-10-12T00:01:00.000Z", {
      evidenceOverrides: {
        ready: false,
        blockers: [{ id: "verification", reason: "Infrastructure failed." }],
      },
    });
    expect(result.status).toBe("blocked");
    expect(result.record).toEqual(initial);
  });

  it("applies sequential promotion only after the parent soak policy permits it", () => {
    let record = createV3RolloutStateLedger("2026-10-12T00:00:00.000Z");
    record = applied(promote(record, "shadow", "shadow", "2026-10-12T00:01:00.000Z"));
    const early = promote(record, "limited", "limited", "2026-10-12T01:00:59.999Z");
    expect(early.status).toBe("blocked");
    const ready = promote(record, "limited", "limited", "2026-10-12T01:01:00.000Z");
    expect(ready.status).toBe("applied");
    if (ready.status !== "applied") return;
    expect(ready.record.revision).toBe(2);
    expect(ready.record.state.stage).toBe("limited");
  });

  it("forces a changed deployment identity through shadow instead of overwriting full", () => {
    const full = fullLedger();
    const inherited = promote(full, "full", "full", "2026-10-14T00:00:00.000Z", {
      deploymentIdentityKey: DEPLOYMENT_B,
    });
    expect(inherited.status).toBe("blocked");
    if (inherited.status !== "blocked") return;
    expect(inherited.decision.blockers[0]?.id).toBe("deployment_changed_restart_shadow");

    const restart = promote(full, "shadow", "shadow", "2026-10-14T00:00:00.000Z", {
      deploymentIdentityKey: DEPLOYMENT_B,
    });
    expect(restart.status).toBe("applied");
  });

  it("persists immediate rollback with revision control and preserves deployment identity", () => {
    const rollback = applyV3RolloutRollback({
      current: fullLedger(),
      expectedRevision: 3,
      to: "limited",
      reasonRef: "incident:runtime-errors",
      serverTime: "2026-10-12T03:05:00.000Z",
    });
    expect(rollback.status).toBe("applied");
    if (rollback.status !== "applied") return;
    expect(rollback.record).toMatchObject({
      revision: 4,
      state: {
        stage: "limited",
        candidateSha: SHA,
        deploymentIdentityKey: DEPLOYMENT_A,
        enteredAt: "2026-10-12T03:05:00.000Z",
      },
      lastChange: {
        kind: "rollback",
        ref: "incident:runtime-errors",
        from: "full",
        to: "limited",
      },
    });
  });

  it("resets the observation epoch after a policy change without changing deployment or stage", () => {
    const full = fullLedger();
    const reset = applyV3RolloutObservationEpochReset({
      current: full,
      expectedRevision: 3,
      policyRef: "feature-flag:solaris_app_v3:updated_at:2026-10-12T04:00:00Z",
      serverTime: "2026-10-12T04:00:00.000Z",
    });
    expect(reset.status).toBe("applied");
    if (reset.status !== "applied") return;
    expect(reset.record).toEqual({
      revision: 4,
      state: {
        stage: "full",
        candidateSha: SHA,
        deploymentIdentityKey: DEPLOYMENT_A,
        enteredAt: "2026-10-12T04:00:00.000Z",
      },
      updatedAt: "2026-10-12T04:00:00.000Z",
      lastChange: {
        kind: "observation_epoch_reset",
        ref: "feature-flag:solaris_app_v3:updated_at:2026-10-12T04:00:00Z",
        from: "full",
        to: "full",
      },
    });
  });

  it("uses optimistic concurrency for observation epoch reset too", () => {
    const reset = applyV3RolloutObservationEpochReset({
      current: fullLedger(),
      expectedRevision: 2,
      policyRef: "policy:new",
      serverTime: "2026-10-12T04:00:00.000Z",
    });
    expect(reset.status).toBe("stale_revision");
  });

  it("does not open observation epochs for legacy or retired state", () => {
    const legacy = createV3RolloutStateLedger("2026-10-12T00:00:00.000Z");
    expect(() =>
      applyV3RolloutObservationEpochReset({
        current: legacy,
        expectedRevision: 0,
        policyRef: "policy:new",
        serverTime: "2026-10-12T01:00:00.000Z",
      }),
    ).toThrow(/no V3 observation epoch/);

    const retired: V3RolloutStateLedger = {
      revision: 4,
      state: {
        stage: "retired",
        candidateSha: SHA,
        deploymentIdentityKey: DEPLOYMENT_A,
        enteredAt: "2026-10-13T03:00:00.000Z",
      },
      updatedAt: "2026-10-13T03:00:00.000Z",
      lastChange: {
        kind: "promotion",
        ref: "retire:4",
        from: "full",
        to: "retired",
      },
    };
    expect(() =>
      applyV3RolloutObservationEpochReset({
        current: retired,
        expectedRevision: 4,
        policyRef: "policy:new",
        serverTime: "2026-10-13T04:00:00.000Z",
      }),
    ).toThrow(/cannot open a new observation epoch/);
  });

  it("rejects malformed persisted history before stale_revision", () => {
    const malformed: V3RolloutStateLedger = {
      revision: 2,
      state: {
        stage: "limited",
        candidateSha: SHA,
        deploymentIdentityKey: DEPLOYMENT_A,
        enteredAt: "2026-10-12T02:00:00.000Z",
      },
      updatedAt: "2026-10-12T02:00:00.000Z",
      lastChange: {
        kind: "promotion",
        ref: "evidence:wrong",
        from: "shadow",
        to: "full",
      },
    };
    expect(() =>
      promote(malformed, "full", "full", "2026-10-12T05:00:00.000Z", {
        expectedRevision: 1,
      }),
    ).toThrow(/last-change destination must match/);
  });

  it("rejects malformed epoch-reset history", () => {
    const malformed: V3RolloutStateLedger = {
      revision: 4,
      state: {
        stage: "full",
        candidateSha: SHA,
        deploymentIdentityKey: DEPLOYMENT_A,
        enteredAt: "2026-10-12T04:00:00.000Z",
      },
      updatedAt: "2026-10-12T04:00:00.000Z",
      lastChange: {
        kind: "observation_epoch_reset",
        ref: "policy:new",
        from: "limited",
        to: "full",
      },
    };
    expect(() =>
      applyV3RolloutObservationEpochReset({
        current: malformed,
        expectedRevision: 4,
        policyRef: "policy:newer",
        serverTime: "2026-10-12T05:00:00.000Z",
      }),
    ).toThrow(/must preserve the current rollout stage/);
  });
});

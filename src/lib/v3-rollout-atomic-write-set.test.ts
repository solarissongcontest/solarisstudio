import { describe, expect, it } from "vitest";

import type { V3ReleaseCandidateDecision } from "./v3-release-candidate-evidence";
import {
  createV3RolloutStateLedger,
  type V3RolloutStateLedger,
} from "./v3-rollout-state-ledger";
import {
  appendV3RolloutTransitionJournal,
  type V3RolloutTransitionJournalEntry,
} from "./v3-rollout-transition-journal";
import {
  planV3RolloutAtomicTransaction,
  V3_ROLLOUT_ATOMIC_WRITE_REQUIREMENTS,
} from "./v3-rollout-atomic-write-set";
import { applyV3RolloutPromotion } from "./v3-rollout-state-ledger";

const SHA = "1234567890abcdef1234567890abcdef12345678";
const DEPLOYMENT = "deployment:production:sha-a:deploy-1:schema-1";
const POLICY = {
  minShadowObservationMs: 0,
  minLimitedObservationMs: 0,
  minFullObservationMsBeforeRetirement: 0,
};

function evidence(
  target: V3ReleaseCandidateDecision["target"],
  ready = true,
): V3ReleaseCandidateDecision {
  return {
    candidateSha: SHA,
    target,
    workflows: ["confirmation"],
    ready,
    blockers: ready
      ? []
      : [{ id: "verification.functional.failed", reason: "Functional failed." }],
  };
}

function promotionCommand(
  to: "shadow" | "limited" | "full" | "retired",
  target: V3ReleaseCandidateDecision["target"],
  serverTime: string,
  ready = true,
) {
  return {
    kind: "promotion" as const,
    to,
    evidence: evidence(target, ready),
    deploymentIdentityKey: DEPLOYMENT,
    policy: POLICY,
    evidenceRef: `manifest:${target}`,
    serverTime,
  };
}

function seededShadow(): {
  current: V3RolloutStateLedger;
  journal: readonly V3RolloutTransitionJournalEntry[];
} {
  const initial = createV3RolloutStateLedger("2026-10-12T00:00:00.000Z");
  const applied = applyV3RolloutPromotion({
    current: initial,
    expectedRevision: 0,
    to: "shadow",
    evidence: evidence("shadow"),
    deploymentIdentityKey: DEPLOYMENT,
    policy: POLICY,
    evidenceRef: "manifest:shadow",
    serverTime: "2026-10-12T00:01:00.000Z",
  });
  if (applied.status !== "applied") throw new Error("shadow seed failed");
  return {
    current: applied.record,
    journal: appendV3RolloutTransitionJournal([], applied),
  };
}

describe("Solaris Studio V3 rollout atomic write-set", () => {
  it("plans one indivisible ledger replacement + journal append for an applied promotion", () => {
    const current = createV3RolloutStateLedger("2026-10-12T00:00:00.000Z");
    const result = planV3RolloutAtomicTransaction({
      current,
      journal: [],
      expectedRevision: 0,
      command: promotionCommand(
        "shadow",
        "shadow",
        "2026-10-12T00:01:00.000Z",
      ),
    });

    expect(result.status).toBe("applied");
    if (result.status !== "applied") return;
    expect(result.writeSet.expectedCurrentRevision).toBe(0);
    expect(result.writeSet.nextLedger.revision).toBe(1);
    expect(result.writeSet.nextLedger.state.stage).toBe("shadow");
    expect(result.writeSet.appendJournalEntry).toMatchObject({
      previousRevision: 0,
      revision: 1,
      kind: "promotion",
      from: "legacy",
      to: "shadow",
    });
    expect(result.writeSet.appendJournalEntry.revision).toBe(
      result.writeSet.nextLedger.revision,
    );
  });

  it("returns no write set for a stale revision", () => {
    const { current, journal } = seededShadow();
    const result = planV3RolloutAtomicTransaction({
      current,
      journal,
      expectedRevision: 0,
      command: promotionCommand(
        "limited",
        "limited",
        "2026-10-12T00:02:00.000Z",
      ),
    });

    expect(result).toEqual({
      status: "stale_revision",
      current,
      writeSet: null,
    });
  });

  it("returns no write set when the underlying promotion is blocked", () => {
    const { current, journal } = seededShadow();
    const result = planV3RolloutAtomicTransaction({
      current,
      journal,
      expectedRevision: 1,
      command: promotionCommand(
        "limited",
        "limited",
        "2026-10-12T00:02:00.000Z",
        false,
      ),
    });

    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") return;
    expect(result.writeSet).toBeNull();
    expect(result.current).toEqual(current);
    expect(result.blockers).toContainEqual({
      id: "release_evidence_blocked",
      reason: "Functional failed.",
    });
  });

  it("fails closed on ledger/journal divergence before evaluating a stale command", () => {
    const { current } = seededShadow();
    const result = planV3RolloutAtomicTransaction({
      current,
      journal: [],
      expectedRevision: 0,
      command: promotionCommand(
        "limited",
        "limited",
        "2026-10-12T00:02:00.000Z",
      ),
    });

    expect(result.status).toBe("integrity_conflict");
    if (result.status !== "integrity_conflict") return;
    expect(result.writeSet).toBeNull();
    expect(result.reason).toMatch(/one entry for every persisted revision/);
  });

  it("plans rollback as the same atomic ledger + journal pair", () => {
    const { current, journal } = seededShadow();
    const result = planV3RolloutAtomicTransaction({
      current,
      journal,
      expectedRevision: 1,
      command: {
        kind: "rollback",
        to: "legacy",
        reasonRef: "incident:rollback",
        serverTime: "2026-10-12T00:02:00.000Z",
      },
    });

    expect(result.status).toBe("applied");
    if (result.status !== "applied") return;
    expect(result.writeSet.nextLedger).toMatchObject({
      revision: 2,
      state: {
        stage: "legacy",
        candidateSha: null,
        deploymentIdentityKey: null,
      },
    });
    expect(result.writeSet.appendJournalEntry).toMatchObject({
      revision: 2,
      kind: "rollback",
      from: "shadow",
      to: "legacy",
      ref: "incident:rollback",
    });
  });

  it("plans observation epoch reset atomically without changing stage or deployment", () => {
    const { current, journal } = seededShadow();
    const result = planV3RolloutAtomicTransaction({
      current,
      journal,
      expectedRevision: 1,
      command: {
        kind: "observation_epoch_reset",
        policyRef: "rollout-policy:cohort-expanded",
        serverTime: "2026-10-12T01:00:00.000Z",
      },
    });

    expect(result.status).toBe("applied");
    if (result.status !== "applied") return;
    expect(result.writeSet.nextLedger).toMatchObject({
      revision: 2,
      state: {
        stage: "shadow",
        candidateSha: SHA,
        deploymentIdentityKey: DEPLOYMENT,
        enteredAt: "2026-10-12T01:00:00.000Z",
      },
    });
    expect(result.writeSet.appendJournalEntry).toMatchObject({
      revision: 2,
      kind: "observation_epoch_reset",
      from: "shadow",
      to: "shadow",
    });
  });

  it("never returns a half write on any non-applied outcome", () => {
    const { current, journal } = seededShadow();
    const stale = planV3RolloutAtomicTransaction({
      current,
      journal,
      expectedRevision: 0,
      command: {
        kind: "rollback",
        to: "legacy",
        reasonRef: "incident:stale",
        serverTime: "2026-10-12T00:02:00.000Z",
      },
    });
    const corrupt = planV3RolloutAtomicTransaction({
      current,
      journal: [],
      expectedRevision: 1,
      command: {
        kind: "rollback",
        to: "legacy",
        reasonRef: "incident:corrupt",
        serverTime: "2026-10-12T00:02:00.000Z",
      },
    });

    expect(stale.status).toBe("stale_revision");
    expect(stale.writeSet).toBeNull();
    expect(corrupt.status).toBe("integrity_conflict");
    expect(corrupt.writeSet).toBeNull();
  });

  it("publishes explicit transaction requirements for the future persistence adapter", () => {
    expect(V3_ROLLOUT_ATOMIC_WRITE_REQUIREMENTS).toEqual({
      compareExpectedRevision: true,
      replaceLedgerAndAppendJournalTogether: true,
      rejectPartialCommit: true,
      uniqueJournalRevision: true,
      integrityCheckBeforeMutation: true,
      databaseTransactionRequired: true,
    });
  });
});

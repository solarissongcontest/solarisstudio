import { describe, expect, it } from "vitest";

import type { V3ReleaseCandidateDecision } from "./v3-release-candidate-evidence";
import { createV3RolloutStateLedger } from "./v3-rollout-state-ledger";
import type { V3RolloutTransitionJournalEntry } from "./v3-rollout-transition-journal";
import {
  planV3RolloutAtomicTransaction,
  type V3RolloutAtomicWriteSet,
} from "./v3-rollout-atomic-write-set";
import {
  reconcileV3RolloutAtomicWrite,
  V3_ROLLOUT_RECONCILIATION_RULES,
} from "./v3-rollout-write-reconciliation";

const SHA = "1234567890abcdef1234567890abcdef12345678";
const DEPLOYMENT = "deployment:production:sha-a:deploy-1:schema-1";
const POLICY = {
  minShadowObservationMs: 0,
  minLimitedObservationMs: 0,
  minFullObservationMsBeforeRetirement: 0,
};

function evidence(): V3ReleaseCandidateDecision {
  return {
    candidateSha: SHA,
    target: "shadow",
    workflows: ["confirmation"],
    ready: true,
    blockers: [],
  };
}

function plannedShadow(evidenceRef = "manifest:shadow:ours") {
  const initial = createV3RolloutStateLedger("2026-10-12T00:00:00.000Z");
  const planned = planV3RolloutAtomicTransaction({
    current: initial,
    journal: [],
    expectedRevision: 0,
    command: {
      kind: "promotion",
      to: "shadow",
      evidence: evidence(),
      deploymentIdentityKey: DEPLOYMENT,
      policy: POLICY,
      evidenceRef,
      serverTime: "2026-10-12T00:01:00.000Z",
    },
  });
  if (planned.status !== "applied") throw new Error("expected planned shadow write");
  return { initial, writeSet: planned.writeSet };
}

function journalFrom(...entries: V3RolloutTransitionJournalEntry[]) {
  return entries as readonly V3RolloutTransitionJournalEntry[];
}

describe("Solaris Studio V3 rollout ambiguous-write reconciliation", () => {
  it("confirms commit only when the exact intended journal entry owns N+1", () => {
    const { writeSet } = plannedShadow();
    const result = reconcileV3RolloutAtomicWrite({
      intended: writeSet,
      current: writeSet.nextLedger,
      journal: journalFrom(writeSet.appendJournalEntry),
      dispatchedAt: "2026-10-12T00:00:59.000Z",
      authoritativeReadAt: "2026-10-12T00:01:05.000Z",
    });

    expect(result).toEqual({
      status: "confirmed_committed",
      committedRevision: 1,
      superseded: false,
      current: writeSet.nextLedger,
    });
  });

  it("still confirms the original write after a later authoritative revision supersedes it", () => {
    const { writeSet } = plannedShadow();
    const reset = planV3RolloutAtomicTransaction({
      current: writeSet.nextLedger,
      journal: journalFrom(writeSet.appendJournalEntry),
      expectedRevision: 1,
      command: {
        kind: "observation_epoch_reset",
        policyRef: "policy:cohort-expanded",
        serverTime: "2026-10-12T01:00:00.000Z",
      },
    });
    if (reset.status !== "applied") throw new Error("expected epoch reset");

    const result = reconcileV3RolloutAtomicWrite({
      intended: writeSet,
      current: reset.writeSet.nextLedger,
      journal: journalFrom(
        writeSet.appendJournalEntry,
        reset.writeSet.appendJournalEntry,
      ),
      dispatchedAt: "2026-10-12T00:00:59.000Z",
      authoritativeReadAt: "2026-10-12T01:00:05.000Z",
    });

    expect(result.status).toBe("confirmed_committed");
    if (result.status !== "confirmed_committed") return;
    expect(result.committedRevision).toBe(1);
    expect(result.superseded).toBe(true);
    expect(result.current.revision).toBe(2);
  });

  it("allows retry only when the authoritative post-dispatch snapshot is the exact old baseline", () => {
    const { initial, writeSet } = plannedShadow();
    const result = reconcileV3RolloutAtomicWrite({
      intended: writeSet,
      current: initial,
      journal: [],
      dispatchedAt: "2026-10-12T00:00:59.000Z",
      authoritativeReadAt: "2026-10-12T00:01:05.000Z",
    });

    expect(result).toEqual({
      status: "retry_allowed",
      expectedRevision: 0,
      current: initial,
    });
  });

  it("forbids retry when the same expected revision no longer represents the command baseline", () => {
    const { initial, writeSet } = plannedShadow();
    const divergentBaseline = {
      ...initial,
      state: {
        ...initial.state,
        enteredAt: "2026-10-12T00:00:30.000Z",
      },
      updatedAt: "2026-10-12T00:00:30.000Z",
    };

    const result = reconcileV3RolloutAtomicWrite({
      intended: writeSet,
      current: divergentBaseline,
      journal: [],
      dispatchedAt: "2026-10-12T00:00:59.000Z",
      authoritativeReadAt: "2026-10-12T00:01:05.000Z",
    });

    expect(result.status).toBe("revision_conflict");
    if (result.status !== "revision_conflict") return;
    expect(result.conflictingRevision).toBe(0);
    expect(result.reason).toMatch(/no longer matches the baseline/);
  });

  it("forbids retry when another authoritative command owns the intended N+1 revision", () => {
    const ours = plannedShadow("manifest:shadow:ours");
    const other = plannedShadow("manifest:shadow:other");

    const result = reconcileV3RolloutAtomicWrite({
      intended: ours.writeSet,
      current: other.writeSet.nextLedger,
      journal: journalFrom(other.writeSet.appendJournalEntry),
      dispatchedAt: "2026-10-12T00:00:59.000Z",
      authoritativeReadAt: "2026-10-12T00:01:05.000Z",
    });

    expect(result.status).toBe("revision_conflict");
    if (result.status !== "revision_conflict") return;
    expect(result.expectedRevision).toBe(0);
    expect(result.conflictingRevision).toBe(1);
    expect(result.reason).toMatch(/Another authoritative rollout transition owns/);
  });

  it("fails closed when the authoritative ledger and journal do not agree", () => {
    const { writeSet } = plannedShadow();
    const result = reconcileV3RolloutAtomicWrite({
      intended: writeSet,
      current: writeSet.nextLedger,
      journal: [],
      dispatchedAt: "2026-10-12T00:00:59.000Z",
      authoritativeReadAt: "2026-10-12T00:01:05.000Z",
    });

    expect(result.status).toBe("integrity_conflict");
    if (result.status !== "integrity_conflict") return;
    expect(result.reason).toMatch(/one entry for every persisted revision/);
  });

  it("fails closed if an authoritative snapshot is somehow older than the dispatched base revision", () => {
    const first = plannedShadow();
    const reset = planV3RolloutAtomicTransaction({
      current: first.writeSet.nextLedger,
      journal: journalFrom(first.writeSet.appendJournalEntry),
      expectedRevision: 1,
      command: {
        kind: "observation_epoch_reset",
        policyRef: "policy:reset",
        serverTime: "2026-10-12T01:00:00.000Z",
      },
    });
    if (reset.status !== "applied") throw new Error("expected reset plan");

    const impossible = reconcileV3RolloutAtomicWrite({
      intended: reset.writeSet,
      current: createV3RolloutStateLedger("2026-10-12T00:00:00.000Z"),
      journal: [],
      dispatchedAt: "2026-10-12T01:00:00.000Z",
      authoritativeReadAt: "2026-10-12T01:00:05.000Z",
    });
    expect(impossible.status).toBe("integrity_conflict");
    if (impossible.status !== "integrity_conflict") return;
    expect(impossible.reason).toMatch(/older than the revision used to dispatch/);
  });

  it("rejects reconciliation reads that happened before the ambiguous dispatch", () => {
    const { initial, writeSet } = plannedShadow();
    expect(() =>
      reconcileV3RolloutAtomicWrite({
        intended: writeSet,
        current: initial,
        journal: [],
        dispatchedAt: "2026-10-12T00:01:00.000Z",
        authoritativeReadAt: "2026-10-12T00:00:59.999Z",
      }),
    ).toThrow(/cannot be before the ambiguous write was dispatched/);
  });

  it("rejects a malformed intended write-set instead of reconciling invented evidence", () => {
    const { initial, writeSet } = plannedShadow();
    const malformed: V3RolloutAtomicWriteSet = {
      ...writeSet,
      appendJournalEntry: {
        ...writeSet.appendJournalEntry,
        previousRevision: 7,
      },
    };

    expect(() =>
      reconcileV3RolloutAtomicWrite({
        intended: malformed,
        current: initial,
        journal: [],
        dispatchedAt: "2026-10-12T00:00:59.000Z",
        authoritativeReadAt: "2026-10-12T00:01:05.000Z",
      }),
    ).toThrow(/bridge the exact expected and next ledger revisions/);
  });

  it("locks the retry semantics explicitly", () => {
    expect(V3_ROLLOUT_RECONCILIATION_RULES).toEqual({
      authoritativeReadMustFollowDispatch: true,
      exactJournalEntryConfirmsCommit: true,
      laterRevisionsDoNotEraseCommitEvidence: true,
      unchangedExpectedRevisionAllowsRetryOnlyFromExactBaseline: true,
      conflictingNextRevisionForbidsRetry: true,
      invalidLedgerJournalSnapshotFailsClosed: true,
    });
  });
});

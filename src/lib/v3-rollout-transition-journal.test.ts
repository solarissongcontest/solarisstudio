import { describe, expect, it } from "vitest";

import type { V3ReleaseCandidateDecision } from "./v3-release-candidate-evidence";
import {
  applyV3RolloutObservationEpochReset,
  applyV3RolloutPromotion,
  applyV3RolloutRollback,
  createV3RolloutStateLedger,
  type V3RolloutLedgerWriteResult,
  type V3RolloutPromotionApplyResult,
} from "./v3-rollout-state-ledger";
import {
  appendV3RolloutTransitionJournal,
  createV3RolloutTransitionJournalEntry,
  validateV3RolloutTransitionJournal,
  V3_ROLLOUT_JOURNAL_PERSISTENCE_CONTRACT,
  type V3AppliedRolloutLedgerResult,
  type V3RolloutTransitionJournalEntry,
} from "./v3-rollout-transition-journal";

const SHA = "1234567890abcdef1234567890abcdef12345678";
const DEPLOYMENT = "deployment:production:sha-a:deploy-1:schema-1";
const POLICY = {
  minShadowObservationMs: 0,
  minLimitedObservationMs: 0,
  minFullObservationMsBeforeRetirement: 0,
};

function releaseEvidence(
  target: V3ReleaseCandidateDecision["target"],
): V3ReleaseCandidateDecision {
  return {
    candidateSha: SHA,
    target,
    workflows: ["confirmation"],
    ready: true,
    blockers: [],
  };
}

function appliedPromotion(
  result: V3RolloutPromotionApplyResult,
): Extract<V3RolloutPromotionApplyResult, { status: "applied" }> {
  if (result.status !== "applied") {
    throw new Error(`Expected applied promotion, got ${result.status}`);
  }
  return result;
}

function appliedWrite(
  result: V3RolloutLedgerWriteResult,
): Extract<V3RolloutLedgerWriteResult, { status: "applied" }> {
  if (result.status !== "applied") {
    throw new Error(`Expected applied ledger write, got ${result.status}`);
  }
  return result;
}

function promotionToShadow() {
  const initial = createV3RolloutStateLedger("2026-10-12T00:00:00.000Z");
  return appliedPromotion(
    applyV3RolloutPromotion({
      current: initial,
      expectedRevision: 0,
      to: "shadow",
      evidence: releaseEvidence("shadow"),
      deploymentIdentityKey: DEPLOYMENT,
      policy: POLICY,
      evidenceRef: "manifest:shadow:1",
      serverTime: "2026-10-12T00:01:00.000Z",
    }),
  );
}

describe("Solaris Studio V3 rollout transition journal", () => {
  it("records promotion, observation-epoch reset and rollback as one contiguous append-only chain", () => {
    const promotion = promotionToShadow();
    let journal = appendV3RolloutTransitionJournal([], promotion);

    const reset = appliedWrite(
      applyV3RolloutObservationEpochReset({
        current: promotion.record,
        expectedRevision: 1,
        policyRef: "rollout-policy:cohort-expanded",
        serverTime: "2026-10-12T01:00:00.000Z",
      }),
    );
    journal = appendV3RolloutTransitionJournal(journal, reset);

    const rollback = appliedWrite(
      applyV3RolloutRollback({
        current: reset.record,
        expectedRevision: 2,
        to: "legacy",
        reasonRef: "incident:runtime-errors",
        serverTime: "2026-10-12T01:05:00.000Z",
      }),
    );
    journal = appendV3RolloutTransitionJournal(journal, rollback);

    expect(journal.map((entry) => [entry.revision, entry.kind, entry.from, entry.to])).toEqual([
      [1, "promotion", "legacy", "shadow"],
      [2, "observation_epoch_reset", "shadow", "shadow"],
      [3, "rollback", "shadow", "legacy"],
    ]);
    expect(journal[1]?.before.deploymentIdentityKey).toBe(DEPLOYMENT);
    expect(journal[1]?.after.deploymentIdentityKey).toBe(DEPLOYMENT);
    expect(journal[1]?.after.enteredAt).toBe("2026-10-12T01:00:00.000Z");
    expect(() => validateV3RolloutTransitionJournal(journal, rollback.record)).not.toThrow();
  });

  it("derives journal evidence from the exact applied before/after records", () => {
    const promotion = promotionToShadow();
    const entry = createV3RolloutTransitionJournalEntry(promotion);

    expect(entry).toEqual({
      revision: 1,
      previousRevision: 0,
      kind: "promotion",
      ref: "manifest:shadow:1",
      from: "legacy",
      to: "shadow",
      occurredAt: "2026-10-12T00:01:00.000Z",
      before: {
        stage: "legacy",
        candidateSha: null,
        deploymentIdentityKey: null,
        enteredAt: "2026-10-12T00:00:00.000Z",
      },
      after: {
        stage: "shadow",
        candidateSha: SHA,
        deploymentIdentityKey: DEPLOYMENT,
        enteredAt: "2026-10-12T00:01:00.000Z",
      },
    });
  });

  it("does not mutate existing journal history when appending", () => {
    const promotion = promotionToShadow();
    const empty: readonly V3RolloutTransitionJournalEntry[] = Object.freeze([]);
    const journal = appendV3RolloutTransitionJournal(empty, promotion);

    expect(empty).toHaveLength(0);
    expect(journal).toHaveLength(1);
    expect(journal).not.toBe(empty);
    expect(Object.isFrozen(journal)).toBe(true);
  });

  it("refuses to append onto missing historical revisions", () => {
    const promotion = promotionToShadow();
    const reset = appliedWrite(
      applyV3RolloutObservationEpochReset({
        current: promotion.record,
        expectedRevision: 1,
        policyRef: "policy:reset",
        serverTime: "2026-10-12T01:00:00.000Z",
      }),
    );

    expect(() => appendV3RolloutTransitionJournal([], reset)).toThrow(
      /exactly one entry for every persisted revision/,
    );
  });

  it("detects a gap or duplicate revision in the journal", () => {
    const promotion = promotionToShadow();
    const entry = createV3RolloutTransitionJournalEntry(promotion);
    const broken = [{ ...entry, revision: 2 }];

    expect(() =>
      validateV3RolloutTransitionJournal(broken, promotion.record),
    ).toThrow(/advance by exactly one|contiguous from revision 1/);
  });

  it("detects before/after chain tampering between adjacent entries", () => {
    const promotion = promotionToShadow();
    let journal = appendV3RolloutTransitionJournal([], promotion);
    const reset = appliedWrite(
      applyV3RolloutObservationEpochReset({
        current: promotion.record,
        expectedRevision: 1,
        policyRef: "policy:reset",
        serverTime: "2026-10-12T01:00:00.000Z",
      }),
    );
    journal = appendV3RolloutTransitionJournal(journal, reset);

    const tampered = journal.map((entry, index) =>
      index === 1
        ? {
            ...entry,
            before: {
              ...entry.before,
              enteredAt: "2026-10-12T00:02:00.000Z",
            },
          }
        : entry,
    );

    expect(() =>
      validateV3RolloutTransitionJournal(tampered, reset.record),
    ).toThrow(/before-state must equal the previous entry after-state/);
  });

  it("detects an observation epoch reset that changes deployment identity", () => {
    const promotion = promotionToShadow();
    const reset = appliedWrite(
      applyV3RolloutObservationEpochReset({
        current: promotion.record,
        expectedRevision: 1,
        policyRef: "policy:reset",
        serverTime: "2026-10-12T01:00:00.000Z",
      }),
    );
    const entry = createV3RolloutTransitionJournalEntry(reset);
    const tampered = {
      ...entry,
      after: {
        ...entry.after,
        deploymentIdentityKey: "deployment:other",
      },
    };

    expect(() =>
      validateV3RolloutTransitionJournal(
        [createV3RolloutTransitionJournalEntry(promotion), tampered],
        reset.record,
      ),
    ).toThrow(/observation epoch reset must preserve stage and deployment identity/);
  });

  it("detects a journal whose tail does not reconstruct the current ledger", () => {
    const promotion = promotionToShadow();
    const journal = appendV3RolloutTransitionJournal([], promotion);
    const alteredCurrent = {
      ...promotion.record,
      state: {
        ...promotion.record.state,
        enteredAt: "2026-10-12T00:02:00.000Z",
      },
      updatedAt: "2026-10-12T00:02:00.000Z",
    };

    expect(() =>
      validateV3RolloutTransitionJournal(journal, alteredCurrent),
    ).toThrow(/tail must equal the current persisted state|tail time/);
  });

  it("rejects an applied result that skips a ledger revision", () => {
    const promotion = promotionToShadow();
    const malformed: V3AppliedRolloutLedgerResult = {
      ...promotion,
      record: {
        ...promotion.record,
        revision: 2,
      },
    };

    expect(() => createV3RolloutTransitionJournalEntry(malformed)).toThrow(
      /advance revision by exactly one/,
    );
  });

  it("requires pristine revision-0 legacy state when history is empty", () => {
    const initial = createV3RolloutStateLedger("2026-10-12T00:00:00.000Z");
    expect(() => validateV3RolloutTransitionJournal([], initial)).not.toThrow();

    const promotion = promotionToShadow();
    expect(() => validateV3RolloutTransitionJournal([], promotion.record)).toThrow(
      /exactly one entry for every persisted revision/,
    );
  });

  it("declares append-only atomic persistence requirements without implementing storage", () => {
    expect(V3_ROLLOUT_JOURNAL_PERSISTENCE_CONTRACT).toEqual({
      appendOnly: true,
      oneEntryPerRevision: true,
      uniqueRevision: true,
      atomicWithLedgerWrite: true,
      serverAuthoritativeTime: true,
      clientMayUpdateOrDeleteHistory: false,
    });
  });
});

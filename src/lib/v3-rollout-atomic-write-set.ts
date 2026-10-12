import type { V3ReleaseCandidateDecision } from "./v3-release-candidate-evidence";
import {
  applyV3RolloutObservationEpochReset,
  applyV3RolloutPromotion,
  applyV3RolloutRollback,
  type V3RolloutStateLedger,
} from "./v3-rollout-state-ledger";
import type {
  V3ActiveRolloutStage,
  V3RolloutPromotionPolicy,
} from "./v3-rollout-promotion-sequence";
import {
  appendV3RolloutTransitionJournal,
  validateV3RolloutTransitionJournal,
  type V3AppliedRolloutLedgerResult,
  type V3RolloutTransitionJournalEntry,
} from "./v3-rollout-transition-journal";

export type V3RolloutAtomicCommand =
  | {
      kind: "promotion";
      to: V3ActiveRolloutStage;
      evidence: V3ReleaseCandidateDecision;
      deploymentIdentityKey: string;
      policy: V3RolloutPromotionPolicy;
      evidenceRef: string;
      serverTime: string;
    }
  | {
      kind: "rollback";
      to: "legacy" | "shadow" | "limited";
      reasonRef: string;
      serverTime: string;
    }
  | {
      kind: "observation_epoch_reset";
      policyRef: string;
      serverTime: string;
    };

export type V3RolloutAtomicWriteSet = {
  expectedCurrentRevision: number;
  nextLedger: V3RolloutStateLedger;
  appendJournalEntry: V3RolloutTransitionJournalEntry;
};

export type V3RolloutAtomicTransactionResult =
  | {
      status: "applied";
      writeSet: V3RolloutAtomicWriteSet;
    }
  | {
      status: "stale_revision";
      current: V3RolloutStateLedger;
      writeSet: null;
    }
  | {
      status: "blocked";
      current: V3RolloutStateLedger;
      blockers: readonly { id: string; reason: string }[];
      writeSet: null;
    }
  | {
      status: "integrity_conflict";
      current: V3RolloutStateLedger;
      reason: string;
      writeSet: null;
    };

function integrityReason(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Rollout ledger and journal integrity validation failed.";
}

function appliedWriteSet(input: {
  current: V3RolloutStateLedger;
  journal: readonly V3RolloutTransitionJournalEntry[];
  applied: V3AppliedRolloutLedgerResult;
}): V3RolloutAtomicTransactionResult {
  const nextJournal = appendV3RolloutTransitionJournal(
    input.journal,
    input.applied,
  );
  const appended = nextJournal[nextJournal.length - 1];
  if (!appended) {
    throw new Error("Applied rollout transaction did not produce a journal entry.");
  }
  if (input.applied.previous.revision !== input.current.revision) {
    throw new Error(
      "Applied rollout transaction previous revision does not match loaded current ledger.",
    );
  }
  if (appended.previousRevision !== input.current.revision) {
    throw new Error(
      "Rollout journal append does not compare against the loaded current revision.",
    );
  }

  return {
    status: "applied",
    writeSet: Object.freeze({
      expectedCurrentRevision: input.current.revision,
      nextLedger: input.applied.record,
      appendJournalEntry: appended,
    }),
  };
}

/**
 * Plans one authoritative rollout transaction from a ledger + complete journal
 * snapshot.
 *
 * This function performs no persistence. A later server/database adapter must
 * execute the returned write set in one transaction: compare the current ledger
 * revision, replace the current ledger row and append the one journal entry.
 * There is deliberately no valid partial-write interpretation.
 */
export function planV3RolloutAtomicTransaction(input: {
  current: V3RolloutStateLedger;
  journal: readonly V3RolloutTransitionJournalEntry[];
  expectedRevision: number;
  command: V3RolloutAtomicCommand;
}): V3RolloutAtomicTransactionResult {
  try {
    validateV3RolloutTransitionJournal(input.journal, input.current);
  } catch (error) {
    return {
      status: "integrity_conflict",
      current: input.current,
      reason: integrityReason(error),
      writeSet: null,
    };
  }

  if (input.command.kind === "promotion") {
    const result = applyV3RolloutPromotion({
      current: input.current,
      expectedRevision: input.expectedRevision,
      to: input.command.to,
      evidence: input.command.evidence,
      deploymentIdentityKey: input.command.deploymentIdentityKey,
      policy: input.command.policy,
      evidenceRef: input.command.evidenceRef,
      serverTime: input.command.serverTime,
    });

    if (result.status === "stale_revision") {
      return {
        status: "stale_revision",
        current: result.record,
        writeSet: null,
      };
    }
    if (result.status === "blocked") {
      return {
        status: "blocked",
        current: result.record,
        blockers: result.decision.blockers,
        writeSet: null,
      };
    }
    return appliedWriteSet({
      current: input.current,
      journal: input.journal,
      applied: result,
    });
  }

  if (input.command.kind === "rollback") {
    const result = applyV3RolloutRollback({
      current: input.current,
      expectedRevision: input.expectedRevision,
      to: input.command.to,
      reasonRef: input.command.reasonRef,
      serverTime: input.command.serverTime,
    });
    if (result.status === "stale_revision") {
      return {
        status: "stale_revision",
        current: result.record,
        writeSet: null,
      };
    }
    return appliedWriteSet({
      current: input.current,
      journal: input.journal,
      applied: result,
    });
  }

  const result = applyV3RolloutObservationEpochReset({
    current: input.current,
    expectedRevision: input.expectedRevision,
    policyRef: input.command.policyRef,
    serverTime: input.command.serverTime,
  });
  if (result.status === "stale_revision") {
    return {
      status: "stale_revision",
      current: result.record,
      writeSet: null,
    };
  }
  return appliedWriteSet({
    current: input.current,
    journal: input.journal,
    applied: result,
  });
}

export const V3_ROLLOUT_ATOMIC_WRITE_REQUIREMENTS = Object.freeze({
  compareExpectedRevision: true,
  replaceLedgerAndAppendJournalTogether: true,
  rejectPartialCommit: true,
  uniqueJournalRevision: true,
  integrityCheckBeforeMutation: true,
  databaseTransactionRequired: true,
});

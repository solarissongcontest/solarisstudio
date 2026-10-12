import type { V3RolloutStateLedger } from "./v3-rollout-state-ledger";
import {
  validateV3RolloutTransitionJournal,
  type V3RolloutJournalState,
  type V3RolloutTransitionJournalEntry,
} from "./v3-rollout-transition-journal";
import type { V3RolloutAtomicWriteSet } from "./v3-rollout-atomic-write-set";

export type V3RolloutWriteReconciliationResult =
  | {
      status: "confirmed_committed";
      committedRevision: number;
      superseded: boolean;
      current: V3RolloutStateLedger;
    }
  | {
      status: "retry_allowed";
      expectedRevision: number;
      current: V3RolloutStateLedger;
    }
  | {
      status: "revision_conflict";
      expectedRevision: number;
      conflictingRevision: number;
      current: V3RolloutStateLedger;
      reason: string;
    }
  | {
      status: "integrity_conflict";
      current: V3RolloutStateLedger;
      reason: string;
    };

function timestamp(value: string, label: string) {
  const normalized = value.trim();
  const ms = Date.parse(normalized);
  if (!normalized || Number.isNaN(ms)) {
    throw new Error(`${label} must be a valid timestamp.`);
  }
  return { value: normalized, ms };
}

function safeRevision(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function sameState(a: V3RolloutJournalState, b: V3RolloutJournalState) {
  return (
    a.stage === b.stage &&
    a.candidateSha === b.candidateSha &&
    a.deploymentIdentityKey === b.deploymentIdentityKey &&
    a.enteredAt === b.enteredAt
  );
}

function ledgerState(record: V3RolloutStateLedger): V3RolloutJournalState {
  return {
    stage: record.state.stage,
    candidateSha: record.state.candidateSha,
    deploymentIdentityKey: record.state.deploymentIdentityKey,
    enteredAt: record.state.enteredAt,
  };
}

function sameEntry(
  a: V3RolloutTransitionJournalEntry,
  b: V3RolloutTransitionJournalEntry,
) {
  return (
    a.revision === b.revision &&
    a.previousRevision === b.previousRevision &&
    a.kind === b.kind &&
    a.ref === b.ref &&
    a.from === b.from &&
    a.to === b.to &&
    a.occurredAt === b.occurredAt &&
    sameState(a.before, b.before) &&
    sameState(a.after, b.after)
  );
}

function validateIntendedWriteSet(writeSet: V3RolloutAtomicWriteSet) {
  const expected = safeRevision(
    writeSet.expectedCurrentRevision,
    "writeSet.expectedCurrentRevision",
  );
  const nextRevision = safeRevision(
    writeSet.nextLedger.revision,
    "writeSet.nextLedger.revision",
  );
  if (nextRevision !== expected + 1) {
    throw new Error("Intended rollout write must advance ledger revision exactly once.");
  }

  const entry = writeSet.appendJournalEntry;
  if (
    entry.previousRevision !== expected ||
    entry.revision !== nextRevision
  ) {
    throw new Error(
      "Intended journal entry must bridge the exact expected and next ledger revisions.",
    );
  }
  const beforeAt = timestamp(entry.before.enteredAt, "writeSet.appendJournalEntry.before.enteredAt");
  const afterAt = timestamp(entry.after.enteredAt, "writeSet.appendJournalEntry.after.enteredAt");
  const occurredAt = timestamp(entry.occurredAt, "writeSet.appendJournalEntry.occurredAt");
  const nextUpdatedAt = timestamp(
    writeSet.nextLedger.updatedAt,
    "writeSet.nextLedger.updatedAt",
  );
  if (afterAt.ms < beforeAt.ms) {
    throw new Error("Intended rollout write cannot move backwards in authoritative time.");
  }
  if (!sameState(entry.after, ledgerState(writeSet.nextLedger))) {
    throw new Error(
      "Intended journal after-state must equal the intended next ledger state.",
    );
  }
  if (
    occurredAt.value !== afterAt.value ||
    occurredAt.value !== nextUpdatedAt.value
  ) {
    throw new Error(
      "Intended journal occurrence time must equal its after-state and next ledger time.",
    );
  }
  const change = writeSet.nextLedger.lastChange;
  if (
    !change ||
    change.kind !== entry.kind ||
    change.ref !== entry.ref ||
    change.from !== entry.from ||
    change.to !== entry.to
  ) {
    throw new Error(
      "Intended journal entry must exactly match next ledger lastChange.",
    );
  }

  return { expectedRevision: expected, committedRevision: nextRevision };
}

function integrityReason(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Authoritative rollout ledger/journal integrity validation failed.";
}

/**
 * Reconciles a transport-ambiguous execution of one #516 atomic write-set.
 *
 * The authoritative snapshot must be read after the ambiguous dispatch. If the
 * exact intended journal entry owns revision N+1, the command committed even if
 * later revisions have already superseded it. If another entry owns N+1, blind
 * retry is forbidden. Retry is allowed only when the complete authoritative
 * post-dispatch snapshot is still at the original expected revision AND still
 * equals the exact baseline state the command was planned against.
 */
export function reconcileV3RolloutAtomicWrite(input: {
  intended: V3RolloutAtomicWriteSet;
  current: V3RolloutStateLedger;
  journal: readonly V3RolloutTransitionJournalEntry[];
  dispatchedAt: string;
  authoritativeReadAt: string;
}): V3RolloutWriteReconciliationResult {
  const dispatch = timestamp(input.dispatchedAt, "dispatchedAt");
  const read = timestamp(input.authoritativeReadAt, "authoritativeReadAt");
  if (read.ms < dispatch.ms) {
    throw new Error(
      "authoritativeReadAt cannot be before the ambiguous write was dispatched.",
    );
  }

  const intended = validateIntendedWriteSet(input.intended);
  try {
    validateV3RolloutTransitionJournal(input.journal, input.current);
  } catch (error) {
    return {
      status: "integrity_conflict",
      current: input.current,
      reason: integrityReason(error),
    };
  }

  const currentRevision = safeRevision(
    input.current.revision,
    "current.revision",
  );
  if (currentRevision < intended.expectedRevision) {
    return {
      status: "integrity_conflict",
      current: input.current,
      reason:
        "Authoritative rollout snapshot is older than the revision used to dispatch the ambiguous write.",
    };
  }

  if (currentRevision === intended.expectedRevision) {
    if (!sameState(ledgerState(input.current), input.intended.appendJournalEntry.before)) {
      return {
        status: "revision_conflict",
        expectedRevision: intended.expectedRevision,
        conflictingRevision: currentRevision,
        current: input.current,
        reason:
          "Authoritative rollout state at the expected revision no longer matches the baseline used to plan the ambiguous write.",
      };
    }
    return {
      status: "retry_allowed",
      expectedRevision: intended.expectedRevision,
      current: input.current,
    };
  }

  const authoritativeEntry = input.journal[intended.committedRevision - 1];
  if (!authoritativeEntry) {
    return {
      status: "integrity_conflict",
      current: input.current,
      reason:
        "Authoritative journal is missing the revision needed to reconcile the ambiguous write.",
    };
  }

  if (sameEntry(authoritativeEntry, input.intended.appendJournalEntry)) {
    return {
      status: "confirmed_committed",
      committedRevision: intended.committedRevision,
      superseded: currentRevision > intended.committedRevision,
      current: input.current,
    };
  }

  return {
    status: "revision_conflict",
    expectedRevision: intended.expectedRevision,
    conflictingRevision: intended.committedRevision,
    current: input.current,
    reason:
      "Another authoritative rollout transition owns the revision this ambiguous write expected to create.",
  };
}

export const V3_ROLLOUT_RECONCILIATION_RULES = Object.freeze({
  authoritativeReadMustFollowDispatch: true,
  exactJournalEntryConfirmsCommit: true,
  laterRevisionsDoNotEraseCommitEvidence: true,
  unchangedExpectedRevisionAllowsRetryOnlyFromExactBaseline: true,
  conflictingNextRevisionForbidsRetry: true,
  invalidLedgerJournalSnapshotFailsClosed: true,
});

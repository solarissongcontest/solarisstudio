import type {
  V3RolloutLedgerWriteResult,
  V3RolloutPromotionApplyResult,
  V3RolloutStateLedger,
  V3RolloutStateLedgerChange,
} from "./v3-rollout-state-ledger";

export type V3AppliedRolloutLedgerResult =
  | Extract<V3RolloutPromotionApplyResult, { status: "applied" }>
  | Extract<V3RolloutLedgerWriteResult, { status: "applied" }>;

export type V3RolloutJournalState = {
  stage: V3RolloutStateLedger["state"]["stage"];
  candidateSha: string | null;
  deploymentIdentityKey: string | null;
  enteredAt: string;
};

export type V3RolloutTransitionJournalEntry = {
  revision: number;
  previousRevision: number;
  kind: V3RolloutStateLedgerChange["kind"];
  ref: string;
  from: V3RolloutStateLedger["state"]["stage"];
  to: V3RolloutStateLedger["state"]["stage"];
  occurredAt: string;
  before: V3RolloutJournalState;
  after: V3RolloutJournalState;
};

function safeRevision(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function timestamp(value: string, label: string) {
  const normalized = value.trim();
  const ms = Date.parse(normalized);
  if (!normalized || Number.isNaN(ms)) {
    throw new Error(`${label} must be a valid timestamp.`);
  }
  return { value: normalized, ms };
}

function nonEmpty(value: string, label: string, maxLength = 512) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty.`);
  if (normalized.length > maxLength) {
    throw new Error(`${label} must not exceed ${maxLength} characters.`);
  }
  return normalized;
}

function fullSha(value: string, label: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalized)) {
    throw new Error(`${label} must be a full 40-character commit SHA.`);
  }
  return normalized;
}

function deploymentKey(value: string, label: string) {
  return nonEmpty(value, label, 1024);
}

function journalState(
  state: V3RolloutStateLedger["state"],
  label: string,
): V3RolloutJournalState {
  const enteredAt = timestamp(state.enteredAt, `${label}.enteredAt`).value;
  if (state.stage === "legacy") {
    if (state.candidateSha !== null || state.deploymentIdentityKey !== null) {
      throw new Error(`${label} legacy state cannot carry V3 identity.`);
    }
    return {
      stage: "legacy",
      candidateSha: null,
      deploymentIdentityKey: null,
      enteredAt,
    };
  }

  return {
    stage: state.stage,
    candidateSha: fullSha(state.candidateSha, `${label}.candidateSha`),
    deploymentIdentityKey: deploymentKey(
      state.deploymentIdentityKey,
      `${label}.deploymentIdentityKey`,
    ),
    enteredAt,
  };
}

function sameState(a: V3RolloutJournalState, b: V3RolloutJournalState) {
  return (
    a.stage === b.stage &&
    a.candidateSha === b.candidateSha &&
    a.deploymentIdentityKey === b.deploymentIdentityKey &&
    a.enteredAt === b.enteredAt
  );
}

function validateLedgerRecord(record: V3RolloutStateLedger, label: string) {
  const revision = safeRevision(record.revision, `${label}.revision`);
  const updatedAt = timestamp(record.updatedAt, `${label}.updatedAt`);
  const state = journalState(record.state, `${label}.state`);
  if (updatedAt.value !== state.enteredAt) {
    throw new Error(`${label}.updatedAt must equal state.enteredAt.`);
  }

  if (revision === 0) {
    if (state.stage !== "legacy" || record.lastChange !== null) {
      throw new Error(`${label} revision 0 must be pristine legacy state.`);
    }
    return state;
  }

  if (!record.lastChange) {
    throw new Error(`${label} revisioned state must retain lastChange.`);
  }
  nonEmpty(record.lastChange.ref, `${label}.lastChange.ref`);
  if (record.lastChange.to !== state.stage) {
    throw new Error(`${label}.lastChange.to must match the current stage.`);
  }
  if (
    record.lastChange.kind === "observation_epoch_reset" &&
    record.lastChange.from !== record.lastChange.to
  ) {
    throw new Error(`${label} observation epoch reset must preserve stage.`);
  }
  return state;
}

function validateJournalEntry(
  entry: V3RolloutTransitionJournalEntry,
  label: string,
) {
  const revision = safeRevision(entry.revision, `${label}.revision`);
  const previousRevision = safeRevision(
    entry.previousRevision,
    `${label}.previousRevision`,
  );
  if (revision !== previousRevision + 1) {
    throw new Error(`${label} revisions must advance by exactly one.`);
  }

  const ref = nonEmpty(entry.ref, `${label}.ref`);
  const occurredAt = timestamp(entry.occurredAt, `${label}.occurredAt`);
  const before = journalState(entry.before as V3RolloutStateLedger["state"], `${label}.before`);
  const after = journalState(entry.after as V3RolloutStateLedger["state"], `${label}.after`);

  if (entry.from !== before.stage || entry.to !== after.stage) {
    throw new Error(`${label} from/to must match its before/after states.`);
  }
  if (occurredAt.value !== after.enteredAt) {
    throw new Error(`${label}.occurredAt must equal after.enteredAt.`);
  }
  const beforeTime = timestamp(before.enteredAt, `${label}.before.enteredAt`);
  if (occurredAt.ms < beforeTime.ms) {
    throw new Error(`${label} cannot move backwards in authoritative time.`);
  }

  if (entry.kind === "observation_epoch_reset") {
    if (
      before.stage !== after.stage ||
      before.candidateSha !== after.candidateSha ||
      before.deploymentIdentityKey !== after.deploymentIdentityKey
    ) {
      throw new Error(
        `${label} observation epoch reset must preserve stage and deployment identity.`,
      );
    }
  }

  return {
    revision,
    previousRevision,
    ref,
    occurredAt: occurredAt.value,
    before,
    after,
  };
}

/**
 * Converts one already-applied #509 ledger transaction into immutable journal
 * evidence. No caller supplies the transition details; they are derived from
 * the exact before/after records returned by the ledger authority.
 */
export function createV3RolloutTransitionJournalEntry(
  applied: V3AppliedRolloutLedgerResult,
): V3RolloutTransitionJournalEntry {
  const before = validateLedgerRecord(applied.previous, "previous");
  const after = validateLedgerRecord(applied.record, "record");
  if (applied.record.revision !== applied.previous.revision + 1) {
    throw new Error("Applied rollout transaction must advance revision by exactly one.");
  }
  if (!applied.record.lastChange) {
    throw new Error("Applied rollout transaction must retain lastChange evidence.");
  }

  const change = applied.record.lastChange;
  if (change.from !== before.stage || change.to !== after.stage) {
    throw new Error(
      "Applied rollout lastChange must match the exact before/after stages.",
    );
  }

  return Object.freeze({
    revision: applied.record.revision,
    previousRevision: applied.previous.revision,
    kind: change.kind,
    ref: nonEmpty(change.ref, "record.lastChange.ref"),
    from: before.stage,
    to: after.stage,
    occurredAt: applied.record.updatedAt,
    before: Object.freeze({ ...before }),
    after: Object.freeze({ ...after }),
  });
}

/**
 * Validates a complete append-only journal against the current #509 record.
 * Every ledger revision after zero must have exactly one transition entry.
 */
export function validateV3RolloutTransitionJournal(
  entries: readonly V3RolloutTransitionJournalEntry[],
  current: V3RolloutStateLedger,
): void {
  const currentState = validateLedgerRecord(current, "current");
  if (current.revision !== entries.length) {
    throw new Error(
      "Rollout journal must contain exactly one entry for every persisted revision after zero.",
    );
  }

  let previousEntry: V3RolloutTransitionJournalEntry | null = null;
  let lastOccurredMs = Number.NEGATIVE_INFINITY;
  entries.forEach((entry, index) => {
    const normalized = validateJournalEntry(entry, `journal[${index}]`);
    const expectedRevision = index + 1;
    if (
      normalized.revision !== expectedRevision ||
      normalized.previousRevision !== expectedRevision - 1
    ) {
      throw new Error("Rollout journal revisions must be contiguous from revision 1.");
    }

    if (previousEntry) {
      if (!sameState(previousEntry.after, normalized.before)) {
        throw new Error(
          "Rollout journal before-state must equal the previous entry after-state.",
        );
      }
    } else if (normalized.before.stage !== "legacy") {
      throw new Error("Rollout journal must begin from pristine legacy state.");
    }

    const occurredMs = Date.parse(normalized.occurredAt);
    if (occurredMs < lastOccurredMs) {
      throw new Error("Rollout journal timestamps must be monotonic.");
    }
    lastOccurredMs = occurredMs;
    previousEntry = entry;
  });

  if (entries.length === 0) {
    if (current.revision !== 0 || currentState.stage !== "legacy") {
      throw new Error("Empty rollout journal is valid only for revision-0 legacy state.");
    }
    return;
  }

  const tail = entries[entries.length - 1]!;
  if (!sameState(tail.after, currentState)) {
    throw new Error("Rollout journal tail must equal the current persisted state.");
  }
  if (tail.occurredAt !== current.updatedAt) {
    throw new Error("Rollout journal tail time must equal current.updatedAt.");
  }
  if (!current.lastChange) {
    throw new Error("Current revisioned rollout state must retain lastChange.");
  }
  if (
    tail.kind !== current.lastChange.kind ||
    tail.ref !== current.lastChange.ref ||
    tail.from !== current.lastChange.from ||
    tail.to !== current.lastChange.to
  ) {
    throw new Error("Rollout journal tail must match current.lastChange exactly.");
  }
}

/**
 * Appends one #509 applied transition without mutating existing history.
 * Existing history must already reconstruct the exact `previous` ledger record.
 */
export function appendV3RolloutTransitionJournal(
  entries: readonly V3RolloutTransitionJournalEntry[],
  applied: V3AppliedRolloutLedgerResult,
): readonly V3RolloutTransitionJournalEntry[] {
  validateV3RolloutTransitionJournal(entries, applied.previous);
  const next = createV3RolloutTransitionJournalEntry(applied);
  const result = Object.freeze([...entries, next]);
  validateV3RolloutTransitionJournal(result, applied.record);
  return result;
}

/**
 * Persistence requirements for the eventual server adapter. The history insert
 * and current-ledger compare-and-write must succeed or fail in one transaction.
 */
export const V3_ROLLOUT_JOURNAL_PERSISTENCE_CONTRACT = Object.freeze({
  appendOnly: true,
  oneEntryPerRevision: true,
  uniqueRevision: true,
  atomicWithLedgerWrite: true,
  serverAuthoritativeTime: true,
  clientMayUpdateOrDeleteHistory: false,
});

import type { V3ReleaseCandidateDecision } from "./v3-release-candidate-evidence";
import {
  createV3LegacyRolloutState,
  evaluateV3RolloutTransition,
  rollbackV3Rollout,
  type V3ActiveRolloutStage,
  type V3RolloutPromotionPolicy,
  type V3RolloutState,
  type V3RolloutTransitionDecision,
} from "./v3-rollout-promotion-sequence";

export type V3RolloutStateLedgerChange = {
  kind: "promotion" | "rollback" | "observation_epoch_reset";
  ref: string;
  from: V3RolloutState["stage"];
  to: V3RolloutState["stage"];
};

export type V3RolloutStateLedger = {
  revision: number;
  state: V3RolloutState;
  updatedAt: string;
  lastChange: V3RolloutStateLedgerChange | null;
};

export type V3RolloutPromotionApplyResult =
  | {
      status: "applied";
      previous: V3RolloutStateLedger;
      record: V3RolloutStateLedger;
      decision: V3RolloutTransitionDecision;
    }
  | {
      status: "blocked";
      record: V3RolloutStateLedger;
      decision: V3RolloutTransitionDecision;
    }
  | {
      status: "stale_revision";
      record: V3RolloutStateLedger;
    };

export type V3RolloutLedgerWriteResult =
  | {
      status: "applied";
      previous: V3RolloutStateLedger;
      record: V3RolloutStateLedger;
    }
  | {
      status: "stale_revision";
      record: V3RolloutStateLedger;
    };

function timestamp(value: string, label: string) {
  const normalized = value.trim();
  const ms = Date.parse(normalized);
  if (!normalized || Number.isNaN(ms)) {
    throw new Error(`${label} must be a valid timestamp.`);
  }
  return { value: normalized, ms };
}

function revision(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function fullSha(value: string, label: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalized)) {
    throw new Error(`${label} must be a full 40-character commit SHA.`);
  }
  return normalized;
}

function deploymentKey(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty.`);
  if (normalized.length > 1024) {
    throw new Error(`${label} must not exceed 1024 characters.`);
  }
  return normalized;
}

function evidenceRef(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty.`);
  if (normalized.length > 512) {
    throw new Error(`${label} must not exceed 512 characters.`);
  }
  return normalized;
}

function copyState(state: V3RolloutState): V3RolloutState {
  return state.stage === "legacy"
    ? {
        stage: "legacy",
        candidateSha: null,
        deploymentIdentityKey: null,
        enteredAt: state.enteredAt,
      }
    : {
        stage: state.stage,
        candidateSha: state.candidateSha,
        deploymentIdentityKey: state.deploymentIdentityKey,
        enteredAt: state.enteredAt,
      };
}

function copyRecord(record: V3RolloutStateLedger): V3RolloutStateLedger {
  return {
    revision: record.revision,
    state: copyState(record.state),
    updatedAt: record.updatedAt,
    lastChange: record.lastChange ? { ...record.lastChange } : null,
  };
}

function validateRecord(record: V3RolloutStateLedger) {
  const recordRevision = revision(record.revision, "ledger.revision");
  const updatedAt = timestamp(record.updatedAt, "ledger.updatedAt");
  const enteredAt = timestamp(record.state.enteredAt, "ledger.state.enteredAt");
  if (updatedAt.ms !== enteredAt.ms) {
    throw new Error(
      "ledger.updatedAt must equal the authoritative state.enteredAt timestamp.",
    );
  }

  if (record.state.stage === "legacy") {
    if (
      record.state.candidateSha !== null ||
      record.state.deploymentIdentityKey !== null
    ) {
      throw new Error(
        "legacy ledger state cannot carry V3 candidate/deployment identity.",
      );
    }
  } else {
    fullSha(record.state.candidateSha, "ledger.state.candidateSha");
    deploymentKey(
      record.state.deploymentIdentityKey,
      "ledger.state.deploymentIdentityKey",
    );
  }

  if (recordRevision === 0) {
    if (record.state.stage !== "legacy" || record.lastChange !== null) {
      throw new Error(
        "revision 0 rollout ledger must be pristine legacy state with no last change.",
      );
    }
    return;
  }

  if (!record.lastChange) {
    throw new Error("revisioned rollout ledger must retain its last change.");
  }
  evidenceRef(record.lastChange.ref, "ledger.lastChange.ref");
  if (record.lastChange.to !== record.state.stage) {
    throw new Error(
      "ledger last-change destination must match the persisted rollout stage.",
    );
  }
  if (
    record.lastChange.kind === "observation_epoch_reset" &&
    record.lastChange.from !== record.lastChange.to
  ) {
    throw new Error(
      "observation epoch reset must preserve the current rollout stage.",
    );
  }
}

function nextRecord(input: {
  current: V3RolloutStateLedger;
  nextState: V3RolloutState;
  serverTime: string;
  change: V3RolloutStateLedgerChange;
}): V3RolloutStateLedger {
  const nextRevision = input.current.revision + 1;
  if (!Number.isSafeInteger(nextRevision)) {
    throw new Error("rollout ledger revision overflow.");
  }

  return {
    revision: nextRevision,
    state: copyState(input.nextState),
    updatedAt: input.serverTime,
    lastChange: { ...input.change },
  };
}

function authoritativeWriteTime(
  current: V3RolloutStateLedger,
  serverTime: string,
) {
  const time = timestamp(serverTime, "serverTime");
  const currentUpdated = timestamp(current.updatedAt, "ledger.updatedAt");
  if (time.ms < currentUpdated.ms) {
    throw new Error("serverTime cannot be before ledger.updatedAt.");
  }
  return time;
}

/** Creates pristine authoritative rollout state before V3 owns traffic. */
export function createV3RolloutStateLedger(
  serverTime: string,
): V3RolloutStateLedger {
  const time = timestamp(serverTime, "serverTime");
  return {
    revision: 0,
    state: createV3LegacyRolloutState(time.value),
    updatedAt: time.value,
    lastChange: null,
  };
}

/**
 * Reference transaction for a rollout promotion.
 *
 * A real database adapter must perform the expected-revision comparison and
 * record update atomically. Replay against an already-applied old revision is
 * stale, not fictional idempotent success.
 */
export function applyV3RolloutPromotion(input: {
  current: V3RolloutStateLedger;
  expectedRevision: number;
  to: V3ActiveRolloutStage;
  evidence: V3ReleaseCandidateDecision;
  deploymentIdentityKey: string;
  policy: V3RolloutPromotionPolicy;
  evidenceRef: string;
  serverTime: string;
}): V3RolloutPromotionApplyResult {
  validateRecord(input.current);
  const expectedRevision = revision(input.expectedRevision, "expectedRevision");
  if (expectedRevision !== input.current.revision) {
    return { status: "stale_revision", record: copyRecord(input.current) };
  }

  const time = authoritativeWriteTime(input.current, input.serverTime);
  const ref = evidenceRef(input.evidenceRef, "evidenceRef");
  const decision = evaluateV3RolloutTransition({
    current: copyState(input.current.state),
    to: input.to,
    evidence: input.evidence,
    deploymentIdentityKey: input.deploymentIdentityKey,
    policy: input.policy,
    now: time.value,
  });

  if (!decision.allowed || !decision.nextState) {
    return {
      status: "blocked",
      record: copyRecord(input.current),
      decision,
    };
  }

  const previous = copyRecord(input.current);
  const record = nextRecord({
    current: input.current,
    nextState: decision.nextState,
    serverTime: time.value,
    change: {
      kind: "promotion",
      ref,
      from: input.current.state.stage,
      to: decision.nextState.stage,
    },
  });
  return { status: "applied", previous, record, decision };
}

/** Immediate safety rollback with optimistic revision control. */
export function applyV3RolloutRollback(input: {
  current: V3RolloutStateLedger;
  expectedRevision: number;
  to: "legacy" | "shadow" | "limited";
  reasonRef: string;
  serverTime: string;
}): V3RolloutLedgerWriteResult {
  validateRecord(input.current);
  const expectedRevision = revision(input.expectedRevision, "expectedRevision");
  if (expectedRevision !== input.current.revision) {
    return { status: "stale_revision", record: copyRecord(input.current) };
  }

  const time = authoritativeWriteTime(input.current, input.serverTime);
  const ref = evidenceRef(input.reasonRef, "reasonRef");
  const nextState = rollbackV3Rollout({
    current: copyState(input.current.state),
    to: input.to,
    now: time.value,
  });
  const previous = copyRecord(input.current);
  const record = nextRecord({
    current: input.current,
    nextState,
    serverTime: time.value,
    change: {
      kind: "rollback",
      ref,
      from: input.current.state.stage,
      to: nextState.stage,
    },
  });
  return { status: "applied", previous, record };
}

/**
 * Resets the observability epoch after a meaningful rollout-policy change while
 * preserving the same deployment and rollout stage.
 *
 * Examples include changing a cohort/edition/admin scope without changing the
 * deployed code. The reset advances revision + authoritative enteredAt so
 * pre-change telemetry cannot be reused, while avoiding the circular mistake of
 * treating every rollout-policy revision as a new deployment that must restart
 * at shadow.
 */
export function applyV3RolloutObservationEpochReset(input: {
  current: V3RolloutStateLedger;
  expectedRevision: number;
  policyRef: string;
  serverTime: string;
}): V3RolloutLedgerWriteResult {
  validateRecord(input.current);
  const expectedRevision = revision(input.expectedRevision, "expectedRevision");
  if (expectedRevision !== input.current.revision) {
    return { status: "stale_revision", record: copyRecord(input.current) };
  }
  if (input.current.state.stage === "legacy") {
    throw new Error("Legacy rollout state has no V3 observation epoch to reset.");
  }
  if (input.current.state.stage === "retired") {
    throw new Error("Retired rollout state cannot open a new observation epoch.");
  }

  const time = authoritativeWriteTime(input.current, input.serverTime);
  const ref = evidenceRef(input.policyRef, "policyRef");
  const previous = copyRecord(input.current);
  const nextState: V3RolloutState = {
    stage: input.current.state.stage,
    candidateSha: input.current.state.candidateSha,
    deploymentIdentityKey: input.current.state.deploymentIdentityKey,
    enteredAt: time.value,
  };
  const record = nextRecord({
    current: input.current,
    nextState,
    serverTime: time.value,
    change: {
      kind: "observation_epoch_reset",
      ref,
      from: input.current.state.stage,
      to: input.current.state.stage,
    },
  });
  return { status: "applied", previous, record };
}

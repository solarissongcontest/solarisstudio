import { supabase } from "@/integrations/supabase/client";
import { toSystemError } from "@/lib/system-error";

type JsonRecord = Record<string, unknown>;

export type OrganizerJuryCorrectionAction = "assign" | "clear";

export type OrganizerJuryCorrectionBlocker = {
  code: string;
  message: string;
  status?: string;
};

export type OrganizerJuryCorrectionPreview = {
  editionId: string;
  showId: string;
  action: OrganizerJuryCorrectionAction;
  version: number;
  stateHash: string;
  stateVersion: string;
  currentPointAssignment: JsonRecord | null;
  currentVotes: JsonRecord[];
  didNotVote: boolean;
  blockers: OrganizerJuryCorrectionBlocker[];
  canApply: boolean;
  results: {
    calculationVersion: number;
    protected: boolean;
    recalculationRequiredIfApplied: boolean;
  };
  riskClass: "R2";
  serverTime: string;
};

export type OrganizerJuryCorrectionResult = {
  ok: true;
  operationId: string;
  receiptId: string;
  editionId: string;
  showId: string;
  voterKey: string;
  version: number;
  stateHash: string;
  stateVersion: string;
  resultsRecalculationRequired: boolean;
  invalidatedResultRows: number;
  serverTime: string;
  replayed: boolean;
};

type ApplyJuryCorrectionInput = {
  editionId: string;
  showId: string;
  voterId: string | null;
  voterCountryId: string | null;
  voterEntityId: string | null;
  action: OrganizerJuryCorrectionAction;
  receivingCountryId: string | null;
  receivingEntityId: string | null;
  points: number;
  reason: string;
  expectedVersion: number;
  expectedStateHash: string;
  operationId: string;
  idempotencyKey: string;
  correlationId: string;
};

type RetainedOperation = {
  fingerprint: string;
  operationId: string;
  idempotencyKey: string;
  correlationId: string;
};

const unresolvedOperationByScope = new Map<string, RetainedOperation>();

function asRecord(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} did not return an object.`);
  }
  return value as JsonRecord;
}

function asString(record: JsonRecord, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`${label} did not return ${key}.`);
  }
  return value;
}

function asNumber(record: JsonRecord, key: string, label: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} did not return ${key}.`);
  }
  return value;
}

function asBoolean(record: JsonRecord, key: string, label: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`${label} did not return ${key}.`);
  }
  return value;
}

function parseBlockers(value: unknown): OrganizerJuryCorrectionBlocker[] {
  if (!Array.isArray(value)) throw new Error("Jury correction preview did not return blockers.");
  return value.map((item) => {
    const blocker = asRecord(item, "Jury correction blocker");
    const status = blocker.status;
    return {
      code: asString(blocker, "code", "Jury correction blocker"),
      message: asString(blocker, "message", "Jury correction blocker"),
      ...(typeof status === "string" && status ? { status } : {}),
    };
  });
}

function parseCurrentAssignment(value: unknown): JsonRecord | null {
  if (value == null) return null;
  return asRecord(value, "Current Jury point assignment");
}

function parseCurrentVotes(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) throw new Error("Jury correction preview did not return current votes.");
  return value.map((item) => asRecord(item, "Jury vote row"));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function correctionScopeKey(input: ApplyJuryCorrectionInput) {
  return JSON.stringify(
    canonicalize({
      editionId: input.editionId,
      showId: input.showId,
      voterId: input.voterId,
      voterCountryId: input.voterCountryId,
      voterEntityId: input.voterEntityId,
      action: input.action,
      points: input.points,
    }),
  );
}

function correctionFingerprint(input: ApplyJuryCorrectionInput) {
  return JSON.stringify(
    canonicalize({
      editionId: input.editionId,
      showId: input.showId,
      voterId: input.voterId,
      voterCountryId: input.voterCountryId,
      voterEntityId: input.voterEntityId,
      action: input.action,
      receivingCountryId: input.receivingCountryId,
      receivingEntityId: input.receivingEntityId,
      points: input.points,
      reason: input.reason.trim(),
      expectedVersion: input.expectedVersion,
      expectedStateHash: input.expectedStateHash,
    }),
  );
}

function retainOperationIdentity(input: ApplyJuryCorrectionInput) {
  const scopeKey = correctionScopeKey(input);
  const fingerprint = correctionFingerprint(input);
  const existing = unresolvedOperationByScope.get(scopeKey);
  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      throw new Error(
        "A previous correction for this Jury point is still unresolved. Reconcile that operation before reviewing a different correction.",
      );
    }
    return { scopeKey, fingerprint, ...existing };
  }

  const retained: RetainedOperation = {
    fingerprint,
    operationId: input.operationId,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
  };
  unresolvedOperationByScope.set(scopeKey, retained);
  return { scopeKey, ...retained };
}

function clearRetainedOperation(scopeKey: string, fingerprint: string) {
  const existing = unresolvedOperationByScope.get(scopeKey);
  if (existing?.fingerprint === fingerprint) unresolvedOperationByScope.delete(scopeKey);
}

export function parseOrganizerJuryCorrectionPreview(
  value: unknown,
): OrganizerJuryCorrectionPreview {
  const record = asRecord(value, "Jury correction preview");
  const action = record.action;
  if (action !== "assign" && action !== "clear") {
    throw new Error("Jury correction preview returned an unknown action.");
  }
  if (record.riskClass !== "R2") {
    throw new Error("Jury correction preview returned an unexpected risk class.");
  }
  const results = asRecord(record.results, "Jury correction Results consequence");
  return {
    editionId: asString(record, "editionId", "Jury correction preview"),
    showId: asString(record, "showId", "Jury correction preview"),
    action,
    version: asNumber(record, "version", "Jury correction preview"),
    stateHash: asString(record, "stateHash", "Jury correction preview"),
    stateVersion: asString(record, "stateVersion", "Jury correction preview"),
    currentPointAssignment: parseCurrentAssignment(record.currentPointAssignment),
    currentVotes: parseCurrentVotes(record.currentVotes),
    didNotVote: asBoolean(record, "didNotVote", "Jury correction preview"),
    blockers: parseBlockers(record.blockers),
    canApply: asBoolean(record, "canApply", "Jury correction preview"),
    results: {
      calculationVersion: asNumber(results, "calculationVersion", "Jury correction Results consequence"),
      protected: asBoolean(results, "protected", "Jury correction Results consequence"),
      recalculationRequiredIfApplied: asBoolean(
        results,
        "recalculationRequiredIfApplied",
        "Jury correction Results consequence",
      ),
    },
    riskClass: "R2",
    serverTime: asString(record, "serverTime", "Jury correction preview"),
  };
}

export function parseOrganizerJuryCorrectionResult(
  value: unknown,
): OrganizerJuryCorrectionResult {
  const record = asRecord(value, "Jury correction operation");
  if (record.ok !== true) throw new Error("Jury correction operation did not succeed.");
  return {
    ok: true,
    operationId: asString(record, "operationId", "Jury correction operation"),
    receiptId: asString(record, "receiptId", "Jury correction operation"),
    editionId: asString(record, "editionId", "Jury correction operation"),
    showId: asString(record, "showId", "Jury correction operation"),
    voterKey: asString(record, "voterKey", "Jury correction operation"),
    version: asNumber(record, "version", "Jury correction operation"),
    stateHash: asString(record, "stateHash", "Jury correction operation"),
    stateVersion: asString(record, "stateVersion", "Jury correction operation"),
    resultsRecalculationRequired: asBoolean(
      record,
      "resultsRecalculationRequired",
      "Jury correction operation",
    ),
    invalidatedResultRows: asNumber(record, "invalidatedResultRows", "Jury correction operation"),
    serverTime: asString(record, "serverTime", "Jury correction operation"),
    replayed: typeof record.replayed === "boolean" ? record.replayed : false,
  };
}

export function juryCorrectionBlockerMessage(preview: OrganizerJuryCorrectionPreview) {
  return preview.blockers.map((blocker) => blocker.message).join(" ") || "Jury correction is not currently available.";
}

export async function previewOrganizerJuryCorrection(input: {
  editionId: string;
  showId: string;
  voterId: string | null;
  voterCountryId: string | null;
  voterEntityId: string | null;
  action: OrganizerJuryCorrectionAction;
  receivingCountryId: string | null;
  receivingEntityId: string | null;
  points: number;
}) {
  const { data, error } = await (supabase.rpc as any)("studio2_jury_vote_correction_preview", {
    p_edition_id: input.editionId,
    p_show_id: input.showId,
    p_voter_id: input.voterId,
    p_voter_country_id: input.voterCountryId,
    p_voter_entity_id: input.voterEntityId,
    p_action: input.action,
    p_receiving_country_id: input.receivingCountryId,
    p_receiving_entity_id: input.receivingEntityId,
    p_points: input.points,
  });
  if (error) throw error;
  const preview = parseOrganizerJuryCorrectionPreview(data);
  if (
    preview.editionId !== input.editionId ||
    preview.showId !== input.showId ||
    preview.action !== input.action
  ) {
    throw new Error("Jury correction preview returned mismatched operation scope.");
  }
  return preview;
}

export async function applyOrganizerJuryCorrection(input: ApplyJuryCorrectionInput) {
  const retained = retainOperationIdentity(input);
  try {
    const { data, error } = await (supabase.rpc as any)("studio2_apply_jury_vote_correction", {
      p_edition_id: input.editionId,
      p_show_id: input.showId,
      p_voter_id: input.voterId,
      p_voter_country_id: input.voterCountryId,
      p_voter_entity_id: input.voterEntityId,
      p_action: input.action,
      p_receiving_country_id: input.receivingCountryId,
      p_receiving_entity_id: input.receivingEntityId,
      p_points: input.points,
      p_reason: input.reason,
      p_expected_version: input.expectedVersion,
      p_expected_state_hash: input.expectedStateHash,
      p_operation_id: retained.operationId,
      p_idempotency_key: retained.idempotencyKey,
      p_correlation_id: retained.correlationId,
    });
    if (error) throw error;

    const result = parseOrganizerJuryCorrectionResult(data);
    if (
      result.operationId !== retained.operationId ||
      result.editionId !== input.editionId ||
      result.showId !== input.showId
    ) {
      throw new Error("Jury correction operation returned mismatched receipt scope.");
    }

    clearRetainedOperation(retained.scopeKey, retained.fingerprint);
    return result;
  } catch (error) {
    const systemError = toSystemError(error);
    if (!systemError.retryable) {
      clearRetainedOperation(retained.scopeKey, retained.fingerprint);
    }
    throw error;
  }
}

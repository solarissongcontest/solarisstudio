import { supabase } from "@/integrations/supabase/client";
import type { VotingConfig } from "@/lib/voting";

type JsonRecord = Record<string, unknown>;

export type OrganizerVotingConfigSnapshot = {
  editionId: string;
  showId: string;
  showName: string;
  version: number;
  config: JsonRecord;
  summary: {
    jury: string;
    public: string;
    points: string;
    tieBreak: string;
    ownCountry: string;
  };
  evidence: JsonRecord;
  resultConfigVersion: number | null;
  serverTime: string;
};

export type OrganizerVotingConfigPreflight = {
  editionId: string;
  showId: string;
  expectedVersion: number;
  changed: boolean;
  blocked: boolean;
  riskClass: "R1" | "R2" | "blocked";
  reasonRequired: boolean;
  recalculationRequired: boolean;
  evidence: JsonRecord;
  serverTime: string;
};

export type OrganizerVotingConfigApplyResult = {
  ok: true;
  operationId: string;
  receiptId: string;
  editionId: string;
  showId: string;
  changed: boolean;
  version: number;
  config: JsonRecord;
  evidence: JsonRecord;
  serverTime: string;
  replayed: boolean;
};

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

function optionalNumber(record: JsonRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseOrganizerVotingConfigSnapshot(
  value: unknown,
): OrganizerVotingConfigSnapshot {
  const record = asRecord(value, "Voting configuration snapshot");
  const summary = asRecord(record.summary, "Voting configuration summary");
  return {
    editionId: asString(record, "editionId", "Voting configuration snapshot"),
    showId: asString(record, "showId", "Voting configuration snapshot"),
    showName: asString(record, "showName", "Voting configuration snapshot"),
    version: asNumber(record, "version", "Voting configuration snapshot"),
    config: asRecord(record.config, "Voting configuration"),
    summary: {
      jury: asString(summary, "jury", "Voting configuration summary"),
      public: asString(summary, "public", "Voting configuration summary"),
      points: asString(summary, "points", "Voting configuration summary"),
      tieBreak: asString(summary, "tieBreak", "Voting configuration summary"),
      ownCountry: asString(summary, "ownCountry", "Voting configuration summary"),
    },
    evidence: asRecord(record.evidence, "Voting configuration evidence"),
    resultConfigVersion: optionalNumber(record, "resultConfigVersion"),
    serverTime: asString(record, "serverTime", "Voting configuration snapshot"),
  };
}

export function parseOrganizerVotingConfigPreflight(
  value: unknown,
): OrganizerVotingConfigPreflight {
  const record = asRecord(value, "Voting configuration preflight");
  const riskClass = record.riskClass;
  if (riskClass !== "R1" && riskClass !== "R2" && riskClass !== "blocked") {
    throw new Error("Voting configuration preflight returned an unknown risk class.");
  }
  return {
    editionId: asString(record, "editionId", "Voting configuration preflight"),
    showId: asString(record, "showId", "Voting configuration preflight"),
    expectedVersion: asNumber(record, "expectedVersion", "Voting configuration preflight"),
    changed: asBoolean(record, "changed", "Voting configuration preflight"),
    blocked: asBoolean(record, "blocked", "Voting configuration preflight"),
    riskClass,
    reasonRequired: asBoolean(record, "reasonRequired", "Voting configuration preflight"),
    recalculationRequired: asBoolean(record, "recalculationRequired", "Voting configuration preflight"),
    evidence: asRecord(record.evidence, "Voting configuration evidence"),
    serverTime: asString(record, "serverTime", "Voting configuration preflight"),
  };
}

export function parseOrganizerVotingConfigApplyResult(
  value: unknown,
): OrganizerVotingConfigApplyResult {
  const record = asRecord(value, "Voting configuration operation");
  if (record.ok !== true) throw new Error("Voting configuration operation did not succeed.");
  return {
    ok: true,
    operationId: asString(record, "operationId", "Voting configuration operation"),
    receiptId: asString(record, "receiptId", "Voting configuration operation"),
    editionId: asString(record, "editionId", "Voting configuration operation"),
    showId: asString(record, "showId", "Voting configuration operation"),
    changed: asBoolean(record, "changed", "Voting configuration operation"),
    version: asNumber(record, "version", "Voting configuration operation"),
    config: asRecord(record.config, "Voting configuration operation config"),
    evidence: asRecord(record.evidence, "Voting configuration operation evidence"),
    serverTime: asString(record, "serverTime", "Voting configuration operation"),
    replayed: typeof record.replayed === "boolean" ? record.replayed : false,
  };
}

export function mergeVotingConfigWithCompatibilityMetadata(
  authoritativeConfig: JsonRecord,
  draft: VotingConfig,
): JsonRecord {
  const existingWeighting =
    authoritativeConfig.weighting &&
    typeof authoritativeConfig.weighting === "object" &&
    !Array.isArray(authoritativeConfig.weighting)
      ? (authoritativeConfig.weighting as JsonRecord)
      : {};

  return {
    ...authoritativeConfig,
    ...draft,
    weighting: {
      ...existingWeighting,
      ...draft.weighting,
    },
  };
}

export function votingEvidenceCount(evidence: JsonRecord, key: string): number {
  const value = evidence[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function fetchOrganizerVotingConfigSnapshot(input: {
  editionId: string;
  showId: string;
}) {
  const { data, error } = await (supabase.rpc as any)("studio2_voting_config_snapshot", {
    p_edition_id: input.editionId,
    p_show_id: input.showId,
  });
  if (error) throw error;
  const snapshot = parseOrganizerVotingConfigSnapshot(data);
  if (snapshot.editionId !== input.editionId || snapshot.showId !== input.showId) {
    throw new Error("Voting configuration snapshot returned a different edition or show.");
  }
  return snapshot;
}

export async function preflightOrganizerVotingConfigChange(input: {
  editionId: string;
  showId: string;
  config: JsonRecord;
}) {
  const { data, error } = await (supabase.rpc as any)("studio2_voting_config_preflight", {
    p_edition_id: input.editionId,
    p_show_id: input.showId,
    p_proposed_config: input.config,
  });
  if (error) throw error;
  const preflight = parseOrganizerVotingConfigPreflight(data);
  if (preflight.editionId !== input.editionId || preflight.showId !== input.showId) {
    throw new Error("Voting configuration preflight returned a different edition or show.");
  }
  return preflight;
}

export async function applyOrganizerVotingConfigChange(input: {
  editionId: string;
  showId: string;
  config: JsonRecord;
  reason: string | null;
  operationId: string;
  idempotencyKey: string;
  expectedVersion: number;
}) {
  const { data, error } = await (supabase.rpc as any)("studio2_apply_voting_config_change", {
    p_edition_id: input.editionId,
    p_show_id: input.showId,
    p_proposed_config: input.config,
    p_reason: input.reason,
    p_operation_id: input.operationId,
    p_idempotency_key: input.idempotencyKey,
    p_expected_version: input.expectedVersion,
  });
  if (error) throw error;
  const result = parseOrganizerVotingConfigApplyResult(data);
  if (
    result.operationId !== input.operationId ||
    result.editionId !== input.editionId ||
    result.showId !== input.showId
  ) {
    throw new Error("Voting configuration operation returned mismatched receipt scope.");
  }
  return result;
}

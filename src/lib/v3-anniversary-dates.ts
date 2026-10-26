import { supabase } from "@/integrations/supabase/client";
import { createOrganisationCommand } from "@/lib/organisation-operation-contract";

export type AnniversaryDatePreview = {
  editionId: string;
  editionNumber: number | null;
  editionName: string;
  previousEventDate: string | null;
  eventDate: string | null;
  previousYear: number | null;
  year: number | null;
  expectedVersion: number;
  changed: boolean;
  serverTime: string;
};

export type AnniversaryDateReceipt = {
  operationId: string;
  replayed: boolean;
  editionId: string;
  editionNumber: number | null;
  editionName: string;
  previousEventDate: string | null;
  eventDate: string | null;
  previousYear: number | null;
  year: number | null;
  previousVersion: number;
  version: number;
  changed: boolean;
};

type JsonRecord = Record<string, unknown>;
type RpcError = { code?: string; message?: string };

type RpcClient = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: RpcError | null }>;
};

const client = supabase as unknown as RpcClient;

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return value as JsonRecord;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return value;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function numberValue(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Solaris returned an invalid ${label}.`);
  return parsed;
}

function nullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Solaris returned an invalid ${label}.`);
  return value;
}

async function rpc(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(name, args);
  if (error) {
    const failure = new Error(error.message || `Solaris RPC failed: ${name}`);
    Object.assign(failure, { code: error.code });
    throw failure;
  }
  return data;
}

function parsePreview(value: unknown): AnniversaryDatePreview {
  const row = record(value, "anniversary date preview");
  return {
    editionId: text(row.editionId, "anniversary edition id"),
    editionNumber: nullableNumber(row.editionNumber),
    editionName: text(row.editionName, "anniversary edition name"),
    previousEventDate: nullableText(row.previousEventDate),
    eventDate: nullableText(row.eventDate),
    previousYear: nullableNumber(row.previousYear),
    year: nullableNumber(row.year),
    expectedVersion: numberValue(row.expectedVersion, "anniversary edition version"),
    changed: boolValue(row.changed, "anniversary change state"),
    serverTime: text(row.serverTime, "anniversary server time"),
  };
}

function parseReceipt(value: unknown, replayed: boolean): AnniversaryDateReceipt {
  const envelope = record(value, "anniversary operation receipt");
  const status = text(envelope.status, "anniversary operation status");
  if (status !== "succeeded") {
    throw new Error(`Anniversary date operation is ${status}.`);
  }
  const result = record(envelope.result, "anniversary operation result");
  return {
    operationId: text(envelope.operationId, "anniversary operation id"),
    replayed,
    editionId: text(result.editionId, "anniversary edition id"),
    editionNumber: nullableNumber(result.editionNumber),
    editionName: text(result.editionName, "anniversary edition name"),
    previousEventDate: nullableText(result.previousEventDate),
    eventDate: nullableText(result.eventDate),
    previousYear: nullableNumber(result.previousYear),
    year: nullableNumber(result.year),
    previousVersion: numberValue(result.previousVersion, "anniversary previous version"),
    version: numberValue(result.version, "anniversary version"),
    changed: boolValue(result.changed, "anniversary result change state"),
  };
}

export async function previewAnniversaryDate(
  editionId: string,
  eventDate: string | null,
): Promise<AnniversaryDatePreview> {
  return parsePreview(
    await rpc("studio2_anniversary_date_preview", {
      p_edition_id: editionId,
      p_event_date: eventDate,
    }),
  );
}

export async function applyAnniversaryDate(input: {
  preview: AnniversaryDatePreview;
  reason: string;
  operationId?: string;
  idempotencyKey?: string;
}): Promise<AnniversaryDateReceipt> {
  const command = createOrganisationCommand({
    command: "story.anniversary_date.set",
    scope: { editionId: input.preview.editionId, entityId: input.preview.editionId },
    payload: {
      eventDate: input.preview.eventDate,
      reason: input.reason,
    },
    riskClass: "R2",
    expectedVersion: input.preview.expectedVersion,
    reason: input.reason,
    operationId: input.operationId,
    idempotencyKey: input.idempotencyKey,
  });

  const args = {
    p_edition_id: input.preview.editionId,
    p_event_date: input.preview.eventDate,
    p_expected_version: input.preview.expectedVersion,
    p_operation_id: command.operationId,
    p_idempotency_key: command.idempotencyKey,
    p_reason: input.reason,
    p_correlation_id: command.correlationId,
  };

  try {
    const response = await rpc("studio2_apply_anniversary_date", args);
    const row = record(response, "anniversary operation response");
    return parseReceipt(row, row.replayed === true);
  } catch (error) {
    // A transport response may disappear after commit. Reconcile the exact
    // operation identity before presenting the outcome as failed or retrying a
    // destructive mutation with a new identity.
    try {
      const reconciliation = await rpc("studio2_reconcile_operation", {
        p_operation_id: command.operationId,
      });
      return parseReceipt(reconciliation, true);
    } catch {
      throw error;
    }
  }
}

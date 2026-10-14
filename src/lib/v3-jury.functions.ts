import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  createSolarisAuthenticatedClientServer,
  getSolarisAccessTokenServer,
} from "@/integrations/supabase/organizer.server";

const entrySchema = z.object({
  target_country_id: z.string().uuid(),
  points: z.number().int().positive(),
});

const showSchema = z.object({ showId: z.string().uuid() });
const operationSchema = z.object({ operationId: z.string().uuid() });
const saveDraftSchema = showSchema.extend({
  selections: z.array(z.string().uuid().nullable()).max(50),
  expectedRevision: z.number().int().nonnegative(),
  deviceId: z.string().trim().min(1).max(120).nullable().optional(),
  sessionId: z.string().trim().min(1).max(120).nullable().optional(),
});
const submitSchema = showSchema.extend({
  entries: z.array(entrySchema).min(1).max(50),
  preflightId: z.string().uuid(),
  operationId: z.string().uuid(),
});

type RpcClient = {
  auth: {
    getUser(token?: string): Promise<{
      data: { user: { id: string } | null };
      error: { message?: string } | null;
    }>;
  };
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

export type V3JuryReceipt = {
  authority: "authoritative_server";
  operationId: string;
  receiptId: string;
  ballotSubmissionId: string;
  showId: string;
  voterCountryId: string;
  requestHash: string;
  stateVersion: number;
  acceptedAt: string;
  serverTime: string;
  replayed: boolean;
};

export type V3JuryDraftResult = {
  found?: boolean;
  ok?: boolean;
  conflict?: boolean;
  reason?: string;
  draftId?: string;
  showId?: string;
  payload?: { selections: Array<string | null> };
  revision: number;
  serverRevision: number;
  deviceId?: string;
  sessionId?: string;
  updatedAt?: string;
  serverTime?: string;
};

type WireReceipt = {
  authority?: unknown;
  operation_id?: unknown;
  receipt_id?: unknown;
  ballot_submission_id?: unknown;
  show_id?: unknown;
  voter_country_id?: unknown;
  request_hash?: unknown;
  state_version?: unknown;
  accepted_at?: unknown;
  server_time?: unknown;
  replayed?: unknown;
};

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid ${label} returned by the jury authority.`);
  }
  return value;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function safeRevision(value: unknown) {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

function normalizeDraftResult(value: Record<string, unknown>): V3JuryDraftResult {
  const payload = objectOrNull(value.payload);
  const selections = Array.isArray(payload?.selections)
    ? payload.selections.map((selection) =>
        typeof selection === "string" ? selection : null,
      )
    : undefined;
  const revision = safeRevision(value.revision);
  return {
    found: value.found === true,
    ok: value.ok === true,
    conflict: value.conflict === true,
    reason: optionalString(value.reason),
    draftId: optionalString(value.draft_id),
    showId: optionalString(value.show_id),
    payload: selections ? { selections } : undefined,
    revision,
    serverRevision: safeRevision(value.server_revision ?? revision),
    deviceId: optionalString(value.device_id),
    sessionId: optionalString(value.session_id),
    updatedAt: optionalString(value.updated_at),
    serverTime: optionalString(value.server_time),
  };
}

function normalizeReceipt(value: unknown): V3JuryReceipt | undefined {
  const receipt = objectOrNull(value) as WireReceipt | null;
  if (!receipt) return undefined;
  if (receipt.authority !== "authoritative_server") {
    throw new Error("The jury authority returned an untrusted receipt.");
  }
  const stateVersion = Number(receipt.state_version);
  if (!Number.isSafeInteger(stateVersion) || stateVersion < 1) {
    throw new Error("The jury authority returned an invalid state version.");
  }
  return {
    authority: "authoritative_server",
    operationId: requiredString(receipt.operation_id, "operation id"),
    receiptId: requiredString(receipt.receipt_id, "receipt id"),
    ballotSubmissionId: requiredString(
      receipt.ballot_submission_id,
      "ballot submission id",
    ),
    showId: requiredString(receipt.show_id, "show id"),
    voterCountryId: requiredString(receipt.voter_country_id, "voter country id"),
    requestHash: requiredString(receipt.request_hash, "request hash"),
    stateVersion,
    acceptedAt: requiredString(receipt.accepted_at, "accepted time"),
    serverTime: requiredString(receipt.server_time, "server time"),
    replayed: receipt.replayed === true,
  };
}

async function authenticatedRpc(
  name: string,
  args?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const token = getSolarisAccessTokenServer();
  const client = createSolarisAuthenticatedClientServer() as unknown as RpcClient;
  const user = await client.auth.getUser(token);
  if (user.error || !user.data.user) throw new Error("Not authenticated");
  const result = await client.rpc(name, args);
  if (result.error) throw new Error(result.error.message ?? `${name} failed`);
  const payload = objectOrNull(result.data);
  if (!payload) throw new Error(`${name} returned an invalid response`);
  return payload;
}

export const loadV3JuryDraft = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => showSchema.parse(data))
  .handler(async ({ data }) => {
    const result = await authenticatedRpc("v3_load_jury_draft", {
      _show_id: data.showId,
    });
    return normalizeDraftResult(result);
  });

export const saveV3JuryDraft = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => saveDraftSchema.parse(data))
  .handler(async ({ data }) => {
    const result = await authenticatedRpc("v3_save_jury_draft", {
      _show_id: data.showId,
      _payload: { selections: data.selections },
      _expected_revision: data.expectedRevision,
      _device_id: data.deviceId ?? null,
      _session_id: data.sessionId ?? null,
    });
    return normalizeDraftResult(result);
  });

export const submitV3JuryBallot = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => submitSchema.parse(data))
  .handler(async ({ data }) => {
    const result = await authenticatedRpc("v3_submit_jury_ballot", {
      _show_id: data.showId,
      _entries: data.entries,
      _preflight_id: data.preflightId,
      _operation_id: data.operationId,
      _request_hash: null,
    });
    return {
      ok: result.ok === true,
      ballotSubmissionId: optionalString(result.ballot_submission_id),
      showId: optionalString(result.show_id),
      receipt: normalizeReceipt(result.receipt),
    };
  });

export const reconcileV3JurySubmission = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => operationSchema.parse(data))
  .handler(async ({ data }) => {
    const result = await authenticatedRpc("v3_reconcile_jury_submission", {
      _operation_id: data.operationId,
    });
    if (result.found !== true) return { found: false as const };
    return {
      found: true as const,
      ok: result.ok === true,
      ballotSubmissionId: optionalString(result.ballot_submission_id),
      showId: optionalString(result.show_id),
      receipt: normalizeReceipt(result.receipt),
    };
  });

export const lookupV3JuryReceipt = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => showSchema.parse(data))
  .handler(async ({ data }) => {
    const result = await authenticatedRpc("v3_jury_receipt", {
      _show_id: data.showId,
    });
    return {
      submitted: result.submitted === true,
      found: result.found === true,
      legacy: result.legacy === true,
      ballotSubmissionId: optionalString(result.ballot_submission_id),
      submittedAt: optionalString(result.submitted_at),
      serverTime: optionalString(result.server_time),
      receipt: normalizeReceipt(result.receipt),
    };
  });

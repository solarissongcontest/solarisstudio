import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import type { AvailabilityReason } from "@/lib/ssc";

const confirmationPayloadSchema = z.object({
  round_id: z.string().uuid(),
  instagram_username: z.string().trim().min(1).max(80),
  country: z.string().trim().min(1).max(80),
  has_country_account: z.boolean(),
  country_account: z.string().trim().max(80),
  participating: z.boolean(),
  selection_method: z.enum(["internal", "national_final", "unknown", ""]),
  entry_unknown: z.boolean(),
  nf_entries_unknown: z.boolean(),
  artist: z.string().trim().max(160),
  song_title: z.string().trim().max(160),
  song_url: z.string().trim().max(500),
  preview_start: z.string().trim().max(10),
  preview_end: z.string().trim().max(10),
  final_clip_start: z.string().trim().max(10),
  final_clip_end: z.string().trim().max(10),
  replacement_video_required: z.boolean(),
  replacement_video_url: z.string().trim().max(500),
  nf_name: z.string().trim().max(160),
  expected_entry_count: z.string().trim().max(4),
  nf_entries: z.array(z.object({
    artist: z.string().trim().max(160),
    song_title: z.string().trim().max(160),
    song_url: z.string().trim().max(500),
  })).max(60),
  nf_date_type: z.string().max(20),
  nf_exact_date: z.string().max(20),
  nf_approximate_text: z.string().trim().max(200),
  nf_result_date_type: z.string().max(20),
  nf_result_exact_date: z.string().max(20),
  nf_result_approximate_text: z.string().trim().max(200),
  reveal_date_type: z.string().max(20),
  reveal_exact_date: z.string().max(20),
  reveal_approximate_text: z.string().trim().max(200),
  browser_session_id: z.string().trim().min(1).max(80),
  edit_token: z.string().trim().max(120).optional(),
});

const submitSchema = confirmationPayloadSchema.extend({
  idempotency_key: z.string().uuid(),
});

const reconcileSchema = z.object({
  idempotency_key: z.string().uuid(),
  browser_session_id: z.string().trim().min(1).max(80),
});

const saveDraftSchema = z.object({
  round_id: z.string().uuid(),
  browser_session_id: z.string().trim().min(1).max(80),
  payload_json: z.string().max(200_000),
  expected_revision: z.number().int().nonnegative(),
});

const loadDraftSchema = z.object({
  round_id: z.string().uuid(),
  browser_session_id: z.string().trim().min(1).max(80),
});

type WireReceipt = {
  authority: "authoritative_server";
  receipt_id: string;
  idempotency_key: string;
  request_hash: string;
  round_id: string;
  accepted_at: string;
  replayed: boolean;
};

export type V3ConfirmationReceipt = {
  authority: "authoritative_server";
  receiptId: string;
  idempotencyKey: string;
  requestHash: string;
  roundId: string;
  serverAcceptedAt: string;
  replayed: boolean;
};

export type V3ConfirmationSubmitResult = {
  ok: boolean;
  found?: boolean;
  error?: string;
  reason?: AvailabilityReason;
  submission_id?: string;
  canonical_sync?: "synced" | "pending";
  receipt?: V3ConfirmationReceipt;
};

type WireConfirmationResult = Omit<V3ConfirmationSubmitResult, "receipt"> & {
  receipt?: WireReceipt;
};

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const db = createConfirmationPublicRuntimeClient();
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

function normalizeReceipt(receipt: WireReceipt | undefined): V3ConfirmationReceipt | undefined {
  if (!receipt) return undefined;
  return {
    authority: "authoritative_server",
    receiptId: receipt.receipt_id,
    idempotencyKey: receipt.idempotency_key,
    requestHash: receipt.request_hash,
    roundId: receipt.round_id,
    serverAcceptedAt: receipt.accepted_at,
    replayed: receipt.replayed,
  };
}

async function attachCanonicalProjection(
  result: WireConfirmationResult,
): Promise<V3ConfirmationSubmitResult> {
  const normalized: V3ConfirmationSubmitResult = {
    ...result,
    receipt: normalizeReceipt(result.receipt),
  };

  if (!result.ok || !result.submission_id) return normalized;

  try {
    const { syncConfirmationSubmissionToSolarisInternal } = await import(
      "@/integrations/confirmations/sync.functions"
    );
    const sync = await syncConfirmationSubmissionToSolarisInternal(result.submission_id);
    normalized.canonical_sync = sync.ok ? "synced" : "pending";
  } catch (error) {
    // The protected participant mutation and its receipt are already committed.
    // A projection failure must never be misreported as a failed Confirmation.
    console.error(
      "[V3 Confirmations] Canonical projection pending after authoritative save",
      error,
    );
    normalized.canonical_sync = "pending";
  }

  return normalized;
}

export const submitV3Confirmation = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => submitSchema.parse(data))
  .handler(async ({ data }) => {
    const [{ getClientIp, sha256Hex }] = await Promise.all([
      import("@/lib/request.server"),
    ]);
    const { idempotency_key, edit_token, ...rest } = data;
    const logicalPayload: Record<string, unknown> = {
      ...rest,
      ...(edit_token ? { edit_token_hash: await sha256Hex(edit_token) } : {}),
    };
    const requestHash = await sha256Hex(JSON.stringify(logicalPayload));
    const payload = {
      ...logicalPayload,
      client_ip: getClientIp(),
    };

    const result = await rpc<WireConfirmationResult>("v3_submit_confirmation", {
      payload,
      _idempotency_key: idempotency_key,
      _request_hash: requestHash,
      _browser_session_id: data.browser_session_id,
    });

    return attachCanonicalProjection(result);
  });

export const reconcileV3Confirmation = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => reconcileSchema.parse(data))
  .handler(async ({ data }) => {
    const result = await rpc<WireConfirmationResult>("v3_reconcile_confirmation", {
      _idempotency_key: data.idempotency_key,
      _browser_session_id: data.browser_session_id,
    });
    if (result.found === false) return { found: false as const };
    return {
      found: true as const,
      result: await attachCanonicalProjection(result),
    };
  });

export const saveV3ConfirmationDraft = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => saveDraftSchema.parse(data))
  .handler(async ({ data }) => {
    const { getClientIp } = await import("@/lib/request.server");
    let parsed: { payload?: Record<string, unknown>; step?: number };
    try {
      parsed = JSON.parse(data.payload_json) as typeof parsed;
    } catch {
      return { ok: false as const, conflict: false as const, error: "invalid_payload" as const };
    }

    const form = parsed.payload ?? {};
    return rpc<{
      ok: boolean;
      conflict: boolean;
      revision: number;
      saved_at?: string;
      payload?: unknown;
      updated_at?: string;
    }>("v3_save_confirmation_draft", {
      _round_id: data.round_id,
      _browser_session_id: data.browser_session_id,
      _payload: parsed,
      _expected_revision: data.expected_revision,
      _instagram_username: typeof form.instagram_username === "string" ? form.instagram_username : "",
      _country: typeof form.country === "string" ? form.country : "",
      _ip: getClientIp(),
    });
  });

export const loadV3ConfirmationDraft = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => loadDraftSchema.parse(data))
  .handler(async ({ data }) =>
    rpc<{
      found: boolean;
      payload?: unknown;
      revision: number;
      updated_at?: string;
    }>("v3_load_confirmation_draft", {
      _round_id: data.round_id,
      _browser_session_id: data.browser_session_id,
    }),
  );

import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { z } from "zod";

import { GLOBAL_MAINTENANCE_MODE } from "@/lib/maintenance";

const editPayloadSchema = z.object({
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
  edit_token: z.string().trim().min(1).max(120),
});

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("resolve"), token: z.string().trim().min(1).max(120) }),
  z.object({
    action: z.literal("submit"),
    idempotency_key: z.string().uuid(),
    data: editPayloadSchema,
  }),
  z.object({
    action: z.literal("reconcile"),
    idempotency_key: z.string().uuid(),
    browser_session_id: z.string().trim().min(1).max(80),
  }),
]);

type ConfirmationSubmitResult = {
  ok: boolean;
  found?: boolean;
  error?: string;
  reason?: string;
  submission_id?: string;
  canonical_sync?: "synced" | "pending";
  operation_id?: string;
  receipt?: Record<string, unknown>;
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "cache-control": "no-store, max-age=0",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { createConfirmationPublicRuntimeClient } = await import(
    "@/integrations/confirmations/public-runtime.server"
  );
  const db = createConfirmationPublicRuntimeClient();
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

async function resolveEditToken(token: string) {
  const { sha256Hex } = await import("@/lib/request.server");
  return rpc<Record<string, unknown>>("public_resolve_edit_token", {
    _token_hash: await sha256Hex(token),
  });
}

async function reconcileOperation(idempotencyKey: string, browserSessionId: string) {
  return rpc<ConfirmationSubmitResult>("v3_reconcile_confirmation", {
    _idempotency_key: idempotencyKey,
    _browser_session_id: browserSessionId,
  });
}

async function submitExistingResponse(
  data: z.infer<typeof editPayloadSchema>,
  idempotencyKey: string,
): Promise<ConfirmationSubmitResult> {
  const { edit_token, ...rest } = data;
  const { getClientIp, sha256Hex } = await import("@/lib/request.server");
  const logicalPayload: Record<string, unknown> = {
    ...rest,
    edit_token_hash: await sha256Hex(edit_token),
  };
  const payload = {
    ...logicalPayload,
    client_ip: getClientIp(),
  };

  let result: ConfirmationSubmitResult;
  try {
    result = await rpc<ConfirmationSubmitResult>("v3_submit_confirmation", {
      payload,
      _idempotency_key: idempotencyKey,
      _request_hash: "database-derived",
      _browser_session_id: data.browser_session_id,
    });
  } catch (submitError) {
    try {
      const reconciled = await reconcileOperation(idempotencyKey, data.browser_session_id);
      if (reconciled.found === true) result = reconciled;
      else throw submitError;
    } catch (reconcileError) {
      if (reconcileError === submitError) throw submitError;
      console.error(
        "[Maintenance Confirmations] Submission status is uncertain; reconciliation is unavailable",
        reconcileError,
      );
      return {
        ok: false,
        error: "submission_uncertain",
        operation_id: idempotencyKey,
      };
    }
  }

  if (result.ok && result.submission_id) {
    try {
      const { syncConfirmationSubmissionToSolarisInternal } = await import(
        "@/integrations/confirmations/sync.functions"
      );
      const sync = await syncConfirmationSubmissionToSolarisInternal(result.submission_id);
      result.canonical_sync = sync.ok ? "synced" : "pending";
    } catch (syncError) {
      // The edit is already authoritative at this point. Never turn a committed
      // Confirmation update into a false failure because a projection retries.
      console.error(
        "[Maintenance Confirmations] Canonical projection pending after authoritative edit",
        syncError,
      );
      result.canonical_sync = "pending";
    }
  }

  return result;
}

function classifySubmitError(error: unknown, operationId: string): ConfirmationSubmitResult {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("duplicate_song")) return { ok: false, error: "duplicate_song" };
  if (message.includes("duplicate_artist")) return { ok: false, error: "duplicate_artist" };
  if (message.includes("editing") && message.includes("closed")) {
    return { ok: false, error: "editing_closed" };
  }
  if (
    message.includes("already completed confirmation requirement") ||
    message.includes("requires explicit reconfirmation")
  ) {
    return { ok: false, error: "confirmation_already_complete" };
  }
  return { ok: false, error: "server", operation_id: operationId };
}

export const Route = createFileRoute("/api/maintenance-confirmation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!GLOBAL_MAINTENANCE_MODE) return json({ error: "not_found" }, 404);
        if (!sameOrigin(request)) return json({ error: "request_origin_rejected" }, 403);
        if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
          return json({ error: "invalid_content_type" }, 415);
        }

        let parsed: z.infer<typeof requestSchema>;
        try {
          parsed = requestSchema.parse(await request.json());
        } catch {
          return json({ error: "invalid_request" }, 400);
        }

        try {
          if (parsed.action === "resolve") {
            return json(await resolveEditToken(parsed.token));
          }

          if (parsed.action === "reconcile") {
            return json(await reconcileOperation(parsed.idempotency_key, parsed.browser_session_id));
          }

          try {
            return json(await submitExistingResponse(parsed.data, parsed.idempotency_key));
          } catch (error) {
            return json(classifySubmitError(error, parsed.idempotency_key));
          }
        } catch (error) {
          console.error("[Maintenance Confirmations] Isolated editor transport failed", error);
          return json({ error: "maintenance_confirmation_unavailable" }, 503);
        }
      },
    },
  },
});

import { supabase } from "@/integrations/supabase/client";
import type { ConfirmationPayload } from "@/lib/ssc";

export type MaintenanceEditRound = {
  id: string;
  name: string;
  status: string;
  opens_at: string | null;
  closes_at: string | null;
  response_limit: number | null;
  edition_id: string;
  edition_name: string;
  edition_number: number;
  response_count: number;
};

export type MaintenanceEditResolution =
  | {
      valid: true;
      reason: "ok";
      submission: Record<string, unknown>;
      round: MaintenanceEditRound;
    }
  | {
      valid: false;
      reason: string;
      submission: null;
      round: null;
    };

export type MaintenanceConfirmationSubmitInput = ConfirmationPayload & {
  browser_session_id: string;
  edit_token: string;
};

export type MaintenanceConfirmationSubmitResult = {
  ok: boolean;
  error?: string;
  reason?: string;
  submission_id?: string;
  operation_id?: string;
};

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: string) {
  return bytesToHex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

function digestToUuid(digest: string) {
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    digest.slice(12, 16),
    digest.slice(16, 20),
    digest.slice(20, 32),
  ].join("-");
}

/**
 * Maintenance must not rely on TanStack server-function transport because the
 * Worker deliberately blocks the generic /_serverFn surface while global
 * maintenance is enabled. These calls go straight to the already-reviewed,
 * token-authorized Confirmation RPCs instead.
 */
export async function resolveMaintenanceConfirmationEditToken(
  token: string,
): Promise<MaintenanceEditResolution> {
  const tokenHash = await sha256Hex(token);
  const { data, error } = await supabase.rpc("public_resolve_edit_token", {
    _token_hash: tokenHash,
  });

  if (error) throw error;

  const result = data as {
    valid?: boolean;
    reason?: string;
    submission?: Record<string, unknown> | null;
    round?: Omit<MaintenanceEditRound, "response_count"> | null;
  } | null;

  if (!result?.valid || !result.submission || !result.round) {
    return {
      valid: false,
      reason: result?.reason ?? "invalid",
      submission: null,
      round: null,
    };
  }

  return {
    valid: true,
    reason: "ok",
    submission: result.submission,
    round: {
      ...result.round,
      response_count: 0,
    },
  };
}

export async function submitMaintenanceConfirmationEdit(
  input: MaintenanceConfirmationSubmitInput,
): Promise<MaintenanceConfirmationSubmitResult> {
  const { edit_token: rawToken, ...rest } = input;
  if (!rawToken || !input.browser_session_id) {
    return { ok: false, error: "maintenance_editor_session_unavailable" };
  }

  const editTokenHash = await sha256Hex(rawToken);
  const logicalPayload = {
    ...rest,
    edit_token_hash: editTokenHash,
  };
  const digest = await sha256Hex(
    `${input.browser_session_id}\n${JSON.stringify(logicalPayload)}`,
  );
  const operationId = digestToUuid(digest);

  try {
    const { data, error } = await supabase.rpc("v3_submit_confirmation", {
      payload: logicalPayload,
      _idempotency_key: operationId,
      _request_hash: "database-derived",
      _browser_session_id: input.browser_session_id,
    });

    if (error) throw error;
    const result = (data ?? {}) as MaintenanceConfirmationSubmitResult;
    return {
      ...result,
      operation_id: result.operation_id ?? operationId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (message.includes("duplicate_song")) return { ok: false, error: "duplicate_song", operation_id: operationId };
    if (message.includes("duplicate_artist")) return { ok: false, error: "duplicate_artist", operation_id: operationId };
    if (message.includes("editing") && message.includes("closed")) return { ok: false, error: "editing_closed", operation_id: operationId };
    if (message.includes("invalid") && message.includes("token")) return { ok: false, error: "edit_token_invalid", operation_id: operationId };
    throw error;
  }
}

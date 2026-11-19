import { MAINTENANCE_CONFIRMATION_API_PATH } from "@/lib/maintenance";
import type { ConfirmationPayload } from "@/lib/ssc";

export type MaintenanceConfirmationSubmitInput = ConfirmationPayload & {
  browser_session_id: string;
  edit_token: string;
};

export type MaintenanceConfirmationSubmitResult = {
  ok: boolean;
  found?: boolean;
  error?: string;
  reason?: string;
  submission_id?: string;
  canonical_sync?: "synced" | "pending";
  operation_id?: string;
  receipt?: Record<string, unknown>;
};

async function postMaintenanceConfirmation(body: unknown) {
  const response = await fetch(MAINTENANCE_CONFIRMATION_API_PATH, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    // Bad input/origin/content type is rejected by the maintenance endpoint
    // before any canonical mutation. It must not be reported as a possibly
    // committed edit just because its HTTP response is non-2xx.
    if (
      typeof body === "object" && body !== null &&
      "action" in body && body.action === "submit" &&
      [400, 403, 415].includes(response.status)
    ) {
      return {
        ok: false,
        error: payload && typeof payload.error === "string" ? payload.error : "invalid_request",
      };
    }
    const message =
      payload && typeof payload.error === "string"
        ? payload.error
        : `Maintenance Confirmation request failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function deterministicOperationId(browserSessionId: string, logicalPayload: unknown) {
  const digest = await sha256Hex(
    `maintenance-confirmation-edit\n${browserSessionId}\n${JSON.stringify(logicalPayload)}`,
  );
  const legacyId = [
    digest.slice(0, 8),
    digest.slice(8, 12),
    digest.slice(12, 16),
    digest.slice(16, 20),
    digest.slice(20, 32),
  ].join("-");

  // The request contract requires a real UUID. Raw SHA-256 nibbles do not
  // guarantee its required version and variant bits, so most saves previously
  // failed Zod validation with HTTP 400 before reaching the canonical writer.
  // Keep already-valid legacy operation IDs stable for safe reconciliation.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(legacyId)) {
    return legacyId;
  }

  // RFC 9562 UUIDv8: deterministic SHA-256-derived identifier with valid
  // version and variant bits. The same edit/session produces the same key.
  const version = `8${digest.slice(13, 16)}`;
  const variant = `${((Number.parseInt(digest[16], 16) & 0x3) | 0x8).toString(16)}${digest.slice(17, 20)}`;
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    version,
    variant,
    digest.slice(20, 32),
  ].join("-");
}

export async function resolveMaintenanceEditToken(token: string) {
  return postMaintenanceConfirmation({ action: "resolve", token });
}

export async function reconcileMaintenanceEdit(
  idempotencyKey: string,
  browserSessionId: string,
): Promise<MaintenanceConfirmationSubmitResult> {
  return postMaintenanceConfirmation({
    action: "reconcile",
    idempotency_key: idempotencyKey,
    browser_session_id: browserSessionId,
  }) as Promise<MaintenanceConfirmationSubmitResult>;
}

export async function submitMaintenanceConfirmation(
  data: MaintenanceConfirmationSubmitInput,
): Promise<MaintenanceConfirmationSubmitResult> {
  if (!data.edit_token || !data.browser_session_id) {
    return { ok: false, error: "editing_closed" };
  }

  const idempotencyKey = await deterministicOperationId(data.browser_session_id, data);
  try {
    return await postMaintenanceConfirmation({
      action: "submit",
      idempotency_key: idempotencyKey,
      data,
    }) as MaintenanceConfirmationSubmitResult;
  } catch (submitError) {
    try {
      const reconciled = await reconcileMaintenanceEdit(
        idempotencyKey,
        data.browser_session_id,
      );
      if (reconciled?.found === true) return reconciled as MaintenanceConfirmationSubmitResult;
    } catch (reconcileError) {
      console.error(
        "[Maintenance Confirmations] Browser reconciliation unavailable after edit transport failure",
        reconcileError,
      );
    }

    console.error("[Maintenance Confirmations] Edit transport failed", submitError);
    return {
      ok: false,
      error: "submission_uncertain",
      operation_id: idempotencyKey,
    };
  }
}

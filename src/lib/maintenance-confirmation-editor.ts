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
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    digest.slice(12, 16),
    digest.slice(16, 20),
    digest.slice(20, 32),
  ].join("-");
}

export async function resolveMaintenanceEditToken(token: string) {
  return postMaintenanceConfirmation({ action: "resolve", token });
}

async function reconcileMaintenanceEdit(idempotencyKey: string, browserSessionId: string) {
  return postMaintenanceConfirmation({
    action: "reconcile",
    idempotency_key: idempotencyKey,
    browser_session_id: browserSessionId,
  });
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

import { supabase } from "@/integrations/supabase/client";
import type { ConfirmationPayload } from "@/lib/ssc";

const ENDPOINT = "/__maintenance-hod/confirmation-edit";

type JsonObject = Record<string, unknown>;

async function currentAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token?.trim() ?? "";
  if (!token) throw new Error("Your Solaris delegation session has expired. Return to the maintenance page and sign in again.");
  return token;
}

async function request<T extends JsonObject>(body: JsonObject): Promise<T> {
  const accessToken = await currentAccessToken();
  const response = await fetch(ENDPOINT, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) {
    const message =
      payload && typeof payload.message === "string"
        ? payload.message
        : "Solaris could not complete that Confirmation request.";
    throw Object.assign(new Error(message), { status: response.status, payload });
  }
  return payload ?? ({} as T);
}

export type MaintenanceHodResolvedEdit = {
  valid: boolean;
  reason?: string;
  submission?: unknown;
  round?: unknown;
};

export async function resolveMaintenanceHodConfirmationEdit(token: string) {
  return request<MaintenanceHodResolvedEdit>({ action: "resolve", token });
}

export type MaintenanceHodSubmitResult = {
  ok: boolean;
  error?: string;
  reason?: string;
  operation_id?: string;
  canonical_sync?: "synced" | "pending";
  receipt?: Record<string, unknown>;
};

export async function submitMaintenanceHodConfirmationEdit(input: {
  roundId: string;
  payload: ConfirmationPayload & Record<string, unknown>;
  browserSessionId: string;
  editToken: string;
  idempotencyKey: string;
}) {
  try {
    return await request<MaintenanceHodSubmitResult>({
      action: "submit",
      roundId: input.roundId,
      payload: input.payload,
      browserSessionId: input.browserSessionId,
      editToken: input.editToken,
      idempotencyKey: input.idempotencyKey,
    });
  } catch (error) {
    // A lost HTTP response is an uncertain result, not permission to mint a
    // second operation. The caller preserves idempotencyKey for the same payload
    // and can explicitly reconcile or safely retry it.
    if (!navigator.onLine || !(error && typeof error === "object" && "status" in error)) {
      return {
        ok: false,
        error: "submission_uncertain",
        operation_id: input.idempotencyKey,
      } satisfies MaintenanceHodSubmitResult;
    }
    throw error;
  }
}

export async function reconcileMaintenanceHodConfirmationEdit(input: {
  browserSessionId: string;
  idempotencyKey: string;
}) {
  return request<MaintenanceHodSubmitResult & { found?: boolean }>({
    action: "reconcile",
    browserSessionId: input.browserSessionId,
    idempotencyKey: input.idempotencyKey,
  });
}

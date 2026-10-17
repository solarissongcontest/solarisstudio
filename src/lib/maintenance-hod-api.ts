import type { MaintenanceHodConfig } from "./maintenance-hod";

type RpcFailure = {
  code?: string;
  message?: string;
};

type JsonObject = Record<string, unknown>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
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

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1]?.trim() || null;
}

async function rpc<T>(
  config: MaintenanceHodConfig,
  accessToken: string,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: {
      apikey: config.supabasePublishableKey,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });

  const payload = (await response.json().catch(() => null)) as T | RpcFailure | null;
  if (!response.ok) {
    const failure = payload && typeof payload === "object" ? (payload as RpcFailure) : null;
    const error = new Error(failure?.message || `Confirmation request failed with HTTP ${response.status}`);
    Object.assign(error, { code: failure?.code || null, status: response.status });
    throw error;
  }
  return payload as T;
}

function publicRpcError(error: unknown) {
  const status =
    error && typeof error === "object" && typeof (error as { status?: unknown }).status === "number"
      ? Number((error as { status: number }).status)
      : 500;
  const code =
    error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
      ? String((error as { code: string }).code)
      : null;

  if (status === 401 || status === 403 || code === "42501") {
    return jsonResponse(
      { ok: false, error: "not_authorized", message: "Your Solaris delegation session is no longer authorized for this response." },
      403,
    );
  }

  console.error("[maintenance-hod] Confirmation transport failed", error);
  return jsonResponse(
    { ok: false, error: "server", message: "Solaris could not complete that Confirmation request." },
    500,
  );
}

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function stripResponseIdentifier(value: unknown) {
  const source = object(value);
  const { submission_id: _submissionId, ...rest } = source;
  return rest;
}

function submissionId(value: unknown) {
  const candidate = object(value).submission_id;
  return typeof candidate === "string" && candidate ? candidate : null;
}

async function syncCanonicalSubmission(id: string) {
  try {
    const { syncConfirmationSubmissionToSolarisInternal } = await import(
      "@/integrations/confirmations/sync.functions"
    );
    const result = await syncConfirmationSubmissionToSolarisInternal(id);
    return result.ok ? "synced" as const : "pending" as const;
  } catch (error) {
    // The protected Confirmation write has already committed. Matching the
    // existing canonical server-function behavior, never turn a committed
    // participant edit into a false failure solely because reconciliation needs
    // recovery.
    console.error("[maintenance-hod] Canonical Confirmation sync needs recovery", error);
    return "pending" as const;
  }
}

function responseIds(access: unknown) {
  const responses = object(access).responses;
  if (!Array.isArray(responses)) return new Set<string>();
  return new Set(
    responses
      .map((response) => object(response).submission_id)
      .filter((id): id is string => typeof id === "string" && Boolean(id)),
  );
}

export async function handleMaintenanceHodConfirmationRequest(
  request: Request,
  config: MaintenanceHodConfig,
) {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }
  if (!sameOrigin(request)) {
    return jsonResponse({ ok: false, error: "origin_rejected" }, 403);
  }

  const accessToken = bearerToken(request);
  if (!accessToken) {
    return jsonResponse({ ok: false, error: "not_authenticated" }, 401);
  }

  let body: JsonObject;
  try {
    body = object(await request.json());
  } catch {
    return jsonResponse({ ok: false, error: "invalid_request" }, 400);
  }

  const action = typeof body.action === "string" ? body.action : "";

  try {
    if (action === "resolve") {
      const token = typeof body.token === "string" ? body.token : "";
      if (!token) return jsonResponse({ valid: false, reason: "invalid" }, 400);
      const result = await rpc<JsonObject>(
        config,
        accessToken,
        "public_country_account_resolve_edit_token",
        { _token: token },
      );
      return jsonResponse(result);
    }

    if (action === "submit") {
      const roundId = typeof body.roundId === "string" ? body.roundId : "";
      const editToken = typeof body.editToken === "string" ? body.editToken : "";
      const browserSessionId =
        typeof body.browserSessionId === "string" ? body.browserSessionId : "";
      const idempotencyKey =
        typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
      const payload = object(body.payload);
      if (!roundId || !editToken || !browserSessionId || !idempotencyKey) {
        return jsonResponse({ ok: false, error: "invalid_request" }, 400);
      }

      const result = await rpc<JsonObject>(
        config,
        accessToken,
        "public_country_account_submit_confirmation_edit",
        {
          _round_id: roundId,
          _payload: payload,
          _idempotency_key: idempotencyKey,
          _browser_session_id: browserSessionId,
          _edit_token: editToken,
        },
      );

      const committedSubmissionId = submissionId(result);
      const sync =
        object(result).ok === true && committedSubmissionId
          ? await syncCanonicalSubmission(committedSubmissionId)
          : undefined;

      return jsonResponse({
        ...stripResponseIdentifier(result),
        ...(sync ? { canonical_sync: sync } : {}),
        operation_id: idempotencyKey,
      });
    }

    if (action === "reconcile") {
      const browserSessionId =
        typeof body.browserSessionId === "string" ? body.browserSessionId : "";
      const idempotencyKey =
        typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
      if (!browserSessionId || !idempotencyKey) {
        return jsonResponse({ found: false, error: "invalid_request" }, 400);
      }

      const [result, access] = await Promise.all([
        rpc<JsonObject>(config, accessToken, "v3_reconcile_confirmation", {
          _idempotency_key: idempotencyKey,
          _browser_session_id: browserSessionId,
        }),
        rpc<JsonObject>(config, accessToken, "public_country_account_confirmation_access", {}),
      ]);

      if (object(result).found !== true) return jsonResponse({ found: false });
      const committedSubmissionId = submissionId(result);
      if (!committedSubmissionId || !responseIds(access).has(committedSubmissionId)) {
        return jsonResponse({ found: false, error: "not_authorized" }, 403);
      }

      const sync = await syncCanonicalSubmission(committedSubmissionId);
      return jsonResponse({
        ...stripResponseIdentifier(result),
        found: true,
        canonical_sync: sync,
        operation_id: idempotencyKey,
      });
    }

    return jsonResponse({ ok: false, error: "unknown_action" }, 400);
  } catch (error) {
    return publicRpcError(error);
  }
}

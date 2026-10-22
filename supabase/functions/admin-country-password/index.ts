import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const pwnedPasswordsRangeUrl = "https://api.pwnedpasswords.com/range";

type PasswordSafetyFailure = {
  message: string;
  stage: "password_policy" | "password_safety_dependency";
  status: number;
};

type CredentialOperation = {
  replayed?: boolean;
  operationId?: string;
  status?: "processing" | "succeeded" | "failed" | "uncertain";
  result?: Record<string, unknown> | null;
  error?: { code?: string; metadata?: Record<string, unknown> } | null;
  sessionPolicy?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha1Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

async function hmacSha256Hex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function breachedPasswordCount(password: string) {
  const hash = await sha1Hex(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const response = await fetch(`${pwnedPasswordsRangeUrl}/${prefix}`, {
    headers: {
      "Add-Padding": "true",
      "User-Agent": "Solaris-Studio-Password-Safety",
    },
  });

  if (!response.ok) throw new Error(`Pwned Passwords returned HTTP ${response.status}`);

  const body = await response.text();
  for (const line of body.split(/\r?\n/)) {
    const [candidateSuffix, countText] = line.trim().split(":", 2);
    if (candidateSuffix?.toUpperCase() !== suffix) continue;
    const count = Number(countText ?? "0");
    return Number.isFinite(count) ? count : 0;
  }
  return 0;
}

async function passwordSafetyFailure(password: string): Promise<PasswordSafetyFailure | null> {
  if (password.length < 6) {
    return {
      message: "Password must be at least 6 characters.",
      stage: "password_policy",
      status: 400,
    };
  }

  try {
    const count = await breachedPasswordCount(password);
    if (count > 0) {
      return {
        message: "That password appears in known data breaches. Choose a different password.",
        stage: "password_policy",
        status: 422,
      };
    }
  } catch (error) {
    console.error("[admin-country-password] Password safety dependency failed", error);
    return {
      message: "Password safety check is temporarily unavailable. Try again in a moment.",
      stage: "password_safety_dependency",
      status: 503,
    };
  }
  return null;
}

function rpcStatus(error: { code?: string; message?: string } | null) {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  if (code === "42501") return message.includes("Fresh authentication") ? 401 : 403;
  if (code === "PT409" || message.includes("VERSION_CONFLICT") || message.includes("STATE_CHANGED")) return 409;
  if (message.includes("IDEMPOTENCY_CONFLICT")) return 409;
  if (code === "P0002") return 404;
  if (code === "22023") return 400;
  return 500;
}

function rpcMessage(error: { code?: string; message?: string } | null) {
  const message = error?.message ?? "";
  if (message.includes("Fresh authentication")) {
    return "Sign in again before replacing a country-account password.";
  }
  if (message.includes("VERSION_CONFLICT")) {
    return "The country account changed after you reviewed it. Reload the account and review the password replacement again.";
  }
  if (message.includes("IDEMPOTENCY_CONFLICT")) {
    return "This credential-change operation was already used for a different reviewed request.";
  }
  if (message.includes("AUTHORIZATION") || error?.code === "42501") {
    return "Your Organizer account is not allowed to replace country-account credentials.";
  }
  if (error?.code === "P0002") return "That country account no longer exists.";
  return "The credential replacement could not be authorized.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Authentication service is not configured." }, 500);
  }

  const authorization = req.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return json({ error: "Sign in as an organizer to continue." }, 401);

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const publicAuth = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const actorDb = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: callerData, error: callerError } = await publicAuth.auth.getUser(token);
  if (callerError || !callerData.user) {
    return json({ error: "Your organizer session has expired." }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const targetUserId = String(body.userId ?? "").trim();
  const countryId = String(body.countryId ?? "").trim();
  const expectedUpdatedAt = String(body.expectedUpdatedAt ?? "").trim();
  const operationId = String(body.operationId ?? "").trim();
  const idempotencyKey = String(body.idempotencyKey ?? "").trim();
  const password = String(body.password ?? "");

  if (!targetUserId || !countryId || !expectedUpdatedAt || !operationId || !idempotencyKey) {
    return json({ error: "The reviewed country-account credential operation is incomplete." }, 400);
  }
  if (password.length > 1024) {
    return json({ error: "Password is too long." }, 400);
  }

  // The keyed value prevents the database request fingerprint from becoming a
  // password dictionary oracle if operation receipts are ever disclosed. The
  // raw password never crosses the database boundary and is never logged.
  const credentialFingerprint = await hmacSha256Hex(
    serviceRoleKey,
    `country-account-credential-replacement:v1:${operationId}:${password}`,
  );

  const { data: beginData, error: beginError } = await actorDb.rpc(
    "studio2_begin_country_account_credential_replace",
    {
      p_target_user_id: targetUserId,
      p_country_id: countryId,
      p_expected_updated_at: expectedUpdatedAt,
      p_credential_fingerprint: credentialFingerprint,
      p_operation_id: operationId,
      p_idempotency_key: idempotencyKey,
      p_correlation_id: operationId,
    },
  );

  if (beginError) {
    return json({ error: rpcMessage(beginError) }, rpcStatus(beginError));
  }

  const operation = (beginData ?? {}) as CredentialOperation;
  if (operation.status === "succeeded" && operation.result) {
    return json(operation.result);
  }
  if (operation.status === "failed") {
    return json(
      {
        error: "This reviewed credential replacement has already failed. Review a new password change before retrying.",
        operationId: operation.operationId ?? operationId,
      },
      409,
    );
  }

  const safetyFailure = await passwordSafetyFailure(password);
  if (safetyFailure) {
    if (safetyFailure.stage === "password_policy") {
      const { error: finalizeError } = await service.rpc(
        "studio2_finalize_country_account_credential_replace",
        {
          p_actor_id: callerData.user.id,
          p_operation_id: operation.operationId ?? operationId,
          p_outcome: "failed",
          p_failure_stage: safetyFailure.stage,
        },
      );
      if (finalizeError) {
        console.error("[admin-country-password] Could not finalize rejected credential operation", {
          operationId: operation.operationId ?? operationId,
          stage: safetyFailure.stage,
          code: finalizeError.code,
        });
      }
    }

    return json(
      {
        error: safetyFailure.message,
        operationId: operation.operationId ?? operationId,
        reconciliationRequired: safetyFailure.stage === "password_safety_dependency",
      },
      safetyFailure.status,
    );
  }

  const { error: updateError } = await service.auth.admin.updateUserById(targetUserId, { password });
  if (updateError) {
    // Do not terminally mark this operation failed. A transport/dependency error
    // may arrive after the identity provider accepted the password. Leaving the
    // receipt processing means the exact same reviewed operation can safely
    // retry the idempotent password assignment and then finalize its receipt.
    console.error("[admin-country-password] Auth credential update outcome is unresolved", {
      operationId: operation.operationId ?? operationId,
      code: updateError.code,
      status: updateError.status,
    });
    return json(
      {
        error: "The password update outcome could not be confirmed. Retry the same reviewed operation.",
        operationId: operation.operationId ?? operationId,
        reconciliationRequired: true,
      },
      502,
    );
  }

  const { data: finalData, error: finalError } = await service.rpc(
    "studio2_finalize_country_account_credential_replace",
    {
      p_actor_id: callerData.user.id,
      p_operation_id: operation.operationId ?? operationId,
      p_outcome: "succeeded",
      p_failure_stage: null,
    },
  );

  if (finalError) {
    console.error("[admin-country-password] Credential changed but receipt finalization is unresolved", {
      operationId: operation.operationId ?? operationId,
      code: finalError.code,
    });
    return json(
      {
        error: "The password changed, but the operation receipt could not be confirmed. Retry the same reviewed operation to reconcile it.",
        operationId: operation.operationId ?? operationId,
        reconciliationRequired: true,
      },
      502,
    );
  }

  const finalized = (finalData ?? {}) as { result?: Record<string, unknown> };
  return json(finalized.result ?? finalData ?? {
    ok: true,
    operationId: operation.operationId ?? operationId,
    userId: targetUserId,
    countryId,
    sessionPolicy: "preserve_existing_sessions",
    sessionsRevoked: false,
  });
});
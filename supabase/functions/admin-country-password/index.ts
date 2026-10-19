import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const pwnedPasswordsRangeUrl = "https://api.pwnedpasswords.com/range";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hex256Pattern = /^[0-9a-f]{64}$/i;

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
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
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

async function passwordSafetyError(password: string) {
  if (password.length < 6) return "Password must be at least 6 characters.";

  try {
    const count = await breachedPasswordCount(password);
    if (count > 0) {
      return "That password appears in known data breaches. Choose a different password.";
    }
  } catch (error) {
    console.error("[admin-country-password] Password safety dependency failed", error);
    return "Password safety check is temporarily unavailable. Try again in a moment.";
  }

  return null;
}

function rpcMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    const message = error.message;
    if (message.includes("Fresh authentication required")) {
      return "Fresh authentication is required. Sign in again, then retry the exact reviewed change.";
    }
    if (message === "AUTHORIZATION") return "You do not have permission to replace country-account credentials.";
    if (message === "STATE_CHANGED") return "The reviewed country account changed. Reload it and review the current target before retrying.";
    if (message === "IDEMPOTENCY_CONFLICT") return "This credential operation identity was already used for different reviewed details. Start a new review.";
  }
  return fallback;
}

function sameInstant(left: unknown, right: string) {
  if (typeof left !== "string") return false;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
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

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: callerData, error: callerError } = await caller.auth.getUser();
  if (callerError || !callerData.user) {
    return json({ error: "Your organizer session has expired." }, 401);
  }

  // Preserve the old fast rejection, while the R3 begin RPC below remains the
  // authoritative capability check through delegation.manage.
  const now = new Date().toISOString();
  const { data: organizerAssignment, error: organizerError } = await service
    .from("studio2_role_assignments")
    .select("id")
    .eq("user_id", callerData.user.id)
    .in("role_key", ["organizer", "superadmin"])
    .is("edition_id", null)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .limit(1)
    .maybeSingle();
  if (organizerError) return json({ error: "Organizer access could not be verified." }, 500);
  if (!organizerAssignment) return json({ error: "Organizer access is required." }, 403);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const targetUserId = String(body.userId ?? "").trim();
  const expectedCountryId = String(body.expectedCountryId ?? "").trim();
  const expectedAccountUpdatedAt = String(body.expectedAccountUpdatedAt ?? "").trim();
  const password = String(body.password ?? "");
  const reason = String(body.reason ?? "").trim();
  const operationId = String(body.operationId ?? "").trim();
  const idempotencyKey = String(body.idempotencyKey ?? "").trim().toLowerCase();

  if (!uuidPattern.test(targetUserId) || !uuidPattern.test(expectedCountryId)) {
    return json({ error: "Choose the reviewed country account again before replacing its password." }, 400);
  }
  if (!uuidPattern.test(operationId) || !hex256Pattern.test(idempotencyKey)) {
    return json({ error: "Credential operation identity is invalid. Start a new review." }, 400);
  }
  if (!expectedAccountUpdatedAt || Number.isNaN(Date.parse(expectedAccountUpdatedAt))) {
    return json({ error: "The reviewed country-account version is invalid. Reload the account." }, 400);
  }
  if (reason.length < 8 || reason.length > 500) {
    return json({ error: "Add a brief reason for this credential replacement." }, 400);
  }

  // Reconcile an already-completed exact operation before depending on password
  // safety or Auth again. A lost response must remain recoverable even if an
  // external dependency is unavailable on the later retry.
  const { data: existingReceipt, error: existingReceiptError } = await service
    .from("studio2_operation_receipts")
    .select("actor_id,command,idempotency_key,status,scope,result")
    .eq("operation_id", operationId)
    .maybeSingle();
  if (existingReceiptError) {
    return json({ error: "Credential operation state could not be reconciled." }, 503);
  }
  if (existingReceipt) {
    const scope = (existingReceipt.scope ?? {}) as Record<string, unknown>;
    const exactIdentity =
      existingReceipt.actor_id === callerData.user.id &&
      existingReceipt.command === "account.country_credential.replace" &&
      existingReceipt.idempotency_key === idempotencyKey &&
      scope.targetUserId === targetUserId &&
      scope.countryId === expectedCountryId &&
      scope.reason === reason &&
      scope.sessionPolicy === "revoke_all" &&
      sameInstant(scope.expectedAccountUpdatedAt, expectedAccountUpdatedAt);

    if (!exactIdentity) {
      return json({ error: "This credential operation identity belongs to different reviewed details." }, 409);
    }
    if (existingReceipt.status === "succeeded" && existingReceipt.result) {
      return json({ ...(existingReceipt.result as Record<string, unknown>), replayed: true });
    }
  }

  const passwordError = await passwordSafetyError(password);
  if (passwordError) return json({ error: passwordError }, password.length < 6 ? 400 : 422);

  // Store no password-derived value that is useful without the server secret.
  // The proof exists solely so same operation identity + different password is
  // rejected as an idempotency conflict.
  const credentialProof = await hmacSha256Hex(
    serviceRoleKey,
    `solaris-country-credential:v1\u0000${operationId}\u0000${targetUserId}\u0000${password}`,
  );

  const { data: beginData, error: beginError } = await caller.rpc(
    "v3_begin_country_account_credential_replacement",
    {
      p_target_user_id: targetUserId,
      p_expected_country_id: expectedCountryId,
      p_expected_account_updated_at: expectedAccountUpdatedAt,
      p_operation_id: operationId,
      p_idempotency_key: idempotencyKey,
      p_reason: reason,
      p_credential_proof: credentialProof,
    },
  );
  if (beginError || !beginData) {
    return json(
      { error: rpcMessage(beginError, "Credential replacement could not be authorized.") },
      beginError?.code === "42501" ? 403 : 409,
    );
  }

  const begin = beginData as Record<string, unknown>;
  if (begin.changed === true && begin.ready !== true) {
    return json(begin);
  }

  const canonicalOperationId = String(begin.operationId ?? operationId);
  const canonicalTargetUserId = String(begin.targetUserId ?? targetUserId);
  const canonicalCountryId = String(begin.countryId ?? expectedCountryId);
  if (
    !uuidPattern.test(canonicalOperationId) ||
    canonicalTargetUserId !== targetUserId ||
    canonicalCountryId !== expectedCountryId
  ) {
    return json({ error: "Credential operation scope changed unexpectedly. Nothing was applied." }, 409);
  }

  const { error: updateError } = await service.auth.admin.updateUserById(targetUserId, { password });
  if (updateError) {
    // Keep the claimed operation in processing state. Retrying the same frozen
    // review safely re-attempts the same password and can reconcile a lost or
    // transient Auth dependency outcome without creating a second operation.
    return json({
      error: "Password could not be changed. Retry the same reviewed operation.",
      operationId: canonicalOperationId,
    }, 502);
  }

  const { data: finalizeData, error: finalizeError } = await service.rpc(
    "v3_finalize_country_account_credential_replacement",
    {
      p_operation_id: canonicalOperationId,
      p_target_user_id: targetUserId,
      p_country_id: expectedCountryId,
    },
  );
  if (finalizeError || !finalizeData) {
    // The Auth change may already be committed. Do not invent a local success;
    // preserve the operation id and require exact replay for reconciliation.
    return json({
      error: "Credential replacement outcome could not be confirmed. Retry the exact reviewed operation to reconcile it.",
      operationId: canonicalOperationId,
    }, 503);
  }

  return json(finalizeData);
});

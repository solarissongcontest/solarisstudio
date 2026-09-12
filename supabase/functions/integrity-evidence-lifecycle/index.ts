import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EVIDENCE_BUCKET = "integrity-evidence";

type LifecycleRequest =
  | { mode: "delete_evidence"; evidenceId: string }
  | { mode: "clean_expired_upload"; tokenId: string };

type DeletionDescriptor = {
  bucket: string;
  storage_path: string | null;
  object_exists: boolean;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseBody(value: unknown): LifecycleRequest | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const mode = String(input.mode ?? "");

  if (mode === "delete_evidence") {
    const evidenceId = String(input.evidenceId ?? "").trim();
    return evidenceId ? { mode, evidenceId } : null;
  }
  if (mode === "clean_expired_upload") {
    const tokenId = String(input.tokenId ?? "").trim();
    return tokenId ? { mode, tokenId } : null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Evidence lifecycle service is not configured." }, 500);
  }

  const authorization = req.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return json({ error: "Sign in with an organizer account." }, 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: callerData, error: callerError } = await authClient.auth.getUser(token);
  if (callerError || !callerData.user) return json({ error: "Your session has expired." }, 401);

  let parsed: LifecycleRequest | null;
  try {
    parsed = parseBody(await req.json());
  } catch {
    parsed = null;
  }
  if (!parsed) return json({ error: "Invalid evidence lifecycle request." }, 400);

  const descriptorRpc = parsed.mode === "delete_evidence"
    ? "admin_integrity_evidence_deletion_descriptor"
    : "admin_integrity_expired_upload_deletion_descriptor";
  const descriptorArgs = parsed.mode === "delete_evidence"
    ? { _evidence_id: parsed.evidenceId }
    : { _token_id: parsed.tokenId };

  const { data: descriptorData, error: descriptorError } = await authClient.rpc(descriptorRpc, descriptorArgs);
  if (descriptorError) {
    return json({ error: descriptorError.message || "Evidence lifecycle action is not available." }, 403);
  }

  const descriptor = descriptorData as DeletionDescriptor | null;
  if (!descriptor || descriptor.bucket !== EVIDENCE_BUCKET) {
    return json({ error: "Evidence lifecycle action is not available." }, 404);
  }

  if (descriptor.object_exists && descriptor.storage_path) {
    const { error: removeError } = await service.storage
      .from(EVIDENCE_BUCKET)
      .remove([descriptor.storage_path]);
    if (removeError) {
      console.error("[integrity-evidence-lifecycle] Failed to remove private object", removeError);
      return json({ error: "Could not remove the private evidence object." }, 500);
    }
  }

  const finalizeRpc = parsed.mode === "delete_evidence"
    ? "admin_finalize_integrity_evidence_deletion"
    : "admin_discard_expired_evidence_upload";
  const finalizeArgs = parsed.mode === "delete_evidence"
    ? { _evidence_id: parsed.evidenceId }
    : { _token_id: parsed.tokenId };

  const { data: finalized, error: finalizeError } = await authClient.rpc(finalizeRpc, finalizeArgs);
  if (finalizeError) {
    console.error("[integrity-evidence-lifecycle] Storage changed but finalization failed", finalizeError);
    return json({ error: finalizeError.message || "Evidence storage was changed but lifecycle finalization failed." }, 409);
  }

  return json({ ok: true, result: finalized });
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EVIDENCE_BUCKET = "integrity-evidence";
const SIGNED_URL_TTL_SECONDS = 60;

type EvidenceDescriptor = {
  bucket: string;
  storage_path: string;
  original_name: string | null;
  mime_type: string | null;
};

type DownloadRequest =
  | { mode: "reporter"; caseId: string; evidenceId: string }
  | { mode: "organizer"; evidenceId: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseBody(value: unknown): DownloadRequest | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const mode = String(input.mode ?? "");
  const evidenceId = String(input.evidenceId ?? "").trim();
  if (!evidenceId) return null;

  if (mode === "organizer") return { mode, evidenceId };
  if (mode === "reporter") {
    const caseId = String(input.caseId ?? "").trim();
    if (!caseId) return null;
    return { mode, caseId, evidenceId };
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
    return json({ error: "Evidence download service is not configured." }, 500);
  }

  const authorization = req.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return json({ error: "Sign in to access protected evidence." }, 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: callerData, error: callerError } = await authClient.auth.getUser(token);
  if (callerError || !callerData.user) {
    return json({ error: "Your session has expired." }, 401);
  }

  let parsed: DownloadRequest | null;
  try {
    parsed = parseBody(await req.json());
  } catch {
    parsed = null;
  }
  if (!parsed) return json({ error: "Invalid evidence download request." }, 400);

  const rpcName = parsed.mode === "reporter"
    ? "reporter_integrity_evidence_access_descriptor"
    : "admin_integrity_evidence_access_descriptor";
  const rpcArgs = parsed.mode === "reporter"
    ? {
        _case_id: parsed.caseId,
        _evidence_id: parsed.evidenceId,
        _action: "download_requested",
      }
    : {
        _evidence_id: parsed.evidenceId,
        _action: "download_requested",
      };

  const { data: descriptorData, error: descriptorError } = await authClient.rpc(rpcName, rpcArgs);
  if (descriptorError) {
    return json({ error: descriptorError.message || "Evidence is not available." }, 403);
  }

  const descriptor = descriptorData as EvidenceDescriptor | null;
  if (!descriptor?.storage_path || descriptor.bucket !== EVIDENCE_BUCKET) {
    return json({ error: "Evidence is not available." }, 404);
  }

  const { data: signed, error: signedError } = await service.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(descriptor.storage_path, SIGNED_URL_TTL_SECONDS, {
      download: descriptor.original_name || true,
    });
  if (signedError || !signed?.signedUrl) {
    console.error("[integrity-evidence-download] Failed to mint signed URL", signedError);
    return json({ error: "Could not create a secure evidence download." }, 500);
  }

  return json({
    url: signed.signedUrl,
    expiresInSeconds: SIGNED_URL_TTL_SECONDS,
    originalName: descriptor.original_name,
    mimeType: descriptor.mime_type,
  });
});

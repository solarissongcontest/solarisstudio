import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Receipt service is not configured." }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const deliveryId = String(body.deliveryId ?? "").trim();
  const token = String(body.token ?? "").trim();
  const stage = String(body.stage ?? "").trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      deliveryId,
    ) ||
    token.length < 32 ||
    !["received", "displayed", "opened"].includes(stage)
  ) {
    return json({ error: "Invalid receipt." }, 400);
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: delivery, error: loadError } = await service
    .from("notification_deliveries")
    .select("id,receipt_token_hash")
    .eq("id", deliveryId)
    .maybeSingle();

  if (loadError || !delivery?.receipt_token_hash) {
    return json({ error: "Receipt not found." }, 404);
  }

  const tokenHash = await sha256Hex(token);
  if (!safeEqual(tokenHash, delivery.receipt_token_hash)) {
    return json({ error: "Receipt denied." }, 403);
  }

  const now = new Date().toISOString();
  const field =
    stage === "received"
      ? "received_at"
      : stage === "displayed"
        ? "displayed_at"
        : "opened_at";

  const { error: updateError } = await service
    .from("notification_deliveries")
    .update({ [field]: now })
    .eq("id", deliveryId)
    .eq("receipt_token_hash", tokenHash)
    .is(field, null);

  if (updateError) {
    console.error("[notification-receipt] update failed", updateError);
    return json({ error: "Receipt could not be recorded." }, 500);
  }

  return json({ ok: true, stage });
});

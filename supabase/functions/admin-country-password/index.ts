import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const pwnedPasswordsRangeUrl = "https://api.pwnedpasswords.com/range";

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
    console.error("[admin-country-password] Password safety check failed", error);
    return "Password safety check is temporarily unavailable. Try again in a moment.";
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

  const { data: callerData, error: callerError } = await publicAuth.auth.getUser(token);
  if (callerError || !callerData.user) {
    return json({ error: "Your organizer session has expired." }, 401);
  }

  const { data: organizerRole, error: organizerError } = await service
    .from("user_roles")
    .select("user_id")
    .eq("user_id", callerData.user.id)
    .eq("role", "organizer")
    .maybeSingle();
  if (organizerError) return json({ error: "Organizer access could not be verified." }, 500);
  if (!organizerRole) return json({ error: "Organizer access is required." }, 403);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const targetUserId = String(body.userId ?? "").trim();
  const password = String(body.password ?? "");
  if (!targetUserId) return json({ error: "Choose a country account first." }, 400);

  const passwordError = await passwordSafetyError(password);
  if (passwordError) return json({ error: passwordError }, password.length < 6 ? 400 : 422);

  const { data: countryAccount, error: countryAccountError } = await service
    .from("country_accounts")
    .select("user_id,country_id")
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (countryAccountError) return json({ error: "Country account could not be verified." }, 500);
  if (!countryAccount) return json({ error: "That user is not a country account." }, 404);

  const { error: updateError } = await service.auth.admin.updateUserById(targetUserId, { password });
  if (updateError) return json({ error: "Password could not be changed. Try again." }, 400);

  return json({ ok: true, userId: targetUserId, countryId: countryAccount.country_id });
});

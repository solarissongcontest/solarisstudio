import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const internalEmailSuffix = "@country.solaris.invalid";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeInstagram(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function validInstagram(value: string) {
  return value.length >= 1 && value.length <= 30 && /^[a-z0-9._]+$/.test(value);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function looksLikeEmail(value: string) {
  return !value.startsWith("@") && validEmail(value);
}

function safeResetRedirect(req: Request) {
  const origin = req.headers.get("origin")?.trim();
  if (!origin) return undefined;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return undefined;
    return `${parsed.origin}/auth/reset`;
  } catch {
    return undefined;
  }
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

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const publicAuth = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const action = String(body.action ?? "");

  async function resolveLoginEmail(identifierInput: unknown) {
    const identifier = String(identifierInput ?? "").trim();
    if (!identifier) return { email: null as string | null, noRecovery: false, suspended: false };

    if (looksLikeEmail(identifier)) {
      return { email: identifier.toLowerCase(), noRecovery: false, suspended: false };
    }

    const username = normalizeInstagram(identifier);
    if (!validInstagram(username)) {
      return { email: null as string | null, noRecovery: false, suspended: false };
    }

    const { data: account, error: accountError } = await service
      .from("country_accounts")
      .select("user_id,status")
      .eq("instagram_username", username)
      .maybeSingle();

    if (accountError || !account) {
      return { email: null as string | null, noRecovery: false, suspended: false };
    }

    const { data: userData, error: userError } = await service.auth.admin.getUserById(account.user_id);
    const email = userError ? null : userData.user?.email ?? null;
    return {
      email,
      noRecovery: Boolean(email?.toLowerCase().endsWith(internalEmailSuffix)),
      suspended: account.status === "suspended",
    };
  }

  if (action === "signup") {
    const countryId = String(body.countryId ?? "").trim();
    const instagramUsername = normalizeInstagram(body.instagramUsername);
    const displayName = String(body.displayName ?? "").trim();
    const password = String(body.password ?? "");
    const recoveryEmail = String(body.email ?? "").trim().toLowerCase();

    if (!countryId) return json({ error: "Choose the country this account will own." }, 400);
    if (!validInstagram(instagramUsername)) {
      return json({ error: "Enter a valid Instagram username using letters, numbers, periods or underscores." }, 400);
    }
    if (!displayName || displayName.length > 80) {
      return json({ error: "Enter your name or nickname." }, 400);
    }
    if (password.length < 6) return json({ error: "Password must be at least 6 characters." }, 400);
    if (recoveryEmail && !validEmail(recoveryEmail)) {
      return json({ error: "Enter a valid recovery email or leave it blank." }, 400);
    }

    const [{ data: country }, { data: usernameOwner }] = await Promise.all([
      service.from("countries").select("id").eq("id", countryId).maybeSingle(),
      service
        .from("country_accounts")
        .select("user_id")
        .eq("instagram_username", instagramUsername)
        .maybeSingle(),
    ]);

    if (!country) return json({ error: "Country not found." }, 400);
    if (usernameOwner) return json({ error: "That Instagram username already has a Solaris Studio account." }, 409);

    const { data: claimedCountry } = await service
      .from("country_accounts")
      .select("user_id")
      .eq("country_id", countryId)
      .maybeSingle();
    if (claimedCountry) return json({ error: "That country already has an account." }, 409);

    const authEmail = recoveryEmail || `${instagramUsername}${internalEmailSuffix}`;
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata: {
        account_type: "country",
        country_id: countryId,
        instagram_username: instagramUsername,
        display_name: displayName,
        has_recovery_email: Boolean(recoveryEmail),
      },
    });

    if (createError || !created.user) {
      const message = createError?.message ?? "Account could not be created.";
      if (message.toLowerCase().includes("already") && recoveryEmail) {
        return json({ error: "That recovery email is already used by another account." }, 409);
      }
      return json({ error: message }, 400);
    }

    const { data: signedIn, error: signInError } = await publicAuth.auth.signInWithPassword({
      email: authEmail,
      password,
    });
    if (signInError || !signedIn.session) {
      return json({ error: "Account created, but automatic sign-in failed. Sign in with your Instagram username." }, 500);
    }

    return json({
      accessToken: signedIn.session.access_token,
      refreshToken: signedIn.session.refresh_token,
      userId: signedIn.user.id,
    });
  }

  if (action === "signin") {
    const password = String(body.password ?? "");
    const resolved = await resolveLoginEmail(body.identifier);
    if (!resolved.email || !password) return json({ error: "Invalid username/email or password." }, 401);
    if (resolved.suspended) return json({ error: "This country account is suspended." }, 403);

    const { data, error } = await publicAuth.auth.signInWithPassword({
      email: resolved.email,
      password,
    });
    if (error || !data.session) return json({ error: "Invalid username/email or password." }, 401);

    return json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      userId: data.user.id,
    });
  }

  if (action === "recover") {
    const resolved = await resolveLoginEmail(body.identifier);
    if (!resolved.email) {
      return json({ ok: true, recoveryAvailable: true });
    }
    if (resolved.noRecovery) {
      return json({ ok: true, recoveryAvailable: false });
    }

    const redirectTo = safeResetRedirect(req);
    const { error } = await publicAuth.auth.resetPasswordForEmail(
      resolved.email,
      redirectTo ? { redirectTo } : undefined,
    );
    if (error) return json({ error: "Password recovery could not be started. Try again later." }, 400);
    return json({ ok: true, recoveryAvailable: true });
  }

  return json({ error: "Unknown authentication action." }, 400);
});

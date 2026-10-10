import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const internalEmailSuffix = "@country.solaris.invalid";
const pwnedPasswordsRangeUrl = "https://api.pwnedpasswords.com/range";

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
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

function requestAddress(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    req.headers.get("cf-connecting-ip")?.trim() ||
    forwarded ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

async function sha1Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function consumeRateLimit(
  service: ReturnType<typeof createClient>,
  scope: string,
  rawKey: string,
  limit: number,
  windowSeconds: number,
) {
  const keyHash = await sha256Hex(`${scope}|${rawKey}`);
  const { data, error } = await service.rpc("country_auth_consume_rate_limit", {
    p_scope: scope,
    p_key_hash: keyHash,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error(`[country-auth] ${scope} rate-limit check failed`, error);
    throw new Error("Authentication protection is temporarily unavailable.");
  }
  return data === true;
}

async function consumeAnonymousRateLimit(
  service: ReturnType<typeof createClient>,
  scope: "signup" | "signin" | "recover",
  clientAddress: string,
  targetKey: string,
  targetLimit: number,
  addressLimit: number,
  windowSeconds: number,
) {
  // A target-only/composite bucket can be bypassed by rotating usernames or
  // countries. Enforce a separate address bucket as the abuse boundary while
  // retaining the narrower address+target bucket for repeated attacks against
  // one account or signup target.
  const [addressAllowed, targetAllowed] = await Promise.all([
    consumeRateLimit(
      service,
      `${scope}:address`,
      clientAddress,
      addressLimit,
      windowSeconds,
    ),
    consumeRateLimit(
      service,
      `${scope}:target`,
      `${clientAddress}|${targetKey}`,
      targetLimit,
      windowSeconds,
    ),
  ]);

  return addressAllowed && targetAllowed;
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

  if (!response.ok) {
    throw new Error(`Pwned Passwords returned HTTP ${response.status}`);
  }

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
      return "That password appears in known data breaches. Choose a different password that you do not use anywhere else.";
    }
  } catch (error) {
    console.error("[country-auth] Password safety check failed", error);
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
  const clientAddress = requestAddress(req);

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

  async function currentUser() {
    const authorization = req.headers.get("authorization") ?? "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) return null;
    const { data, error } = await publicAuth.auth.getUser(token);
    return error ? null : data.user ?? null;
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

    try {
      // Signup has a strict address-only bucket so rotating country/username
      // targets cannot buy the same caller more password or database work.
      const addressAllowed = await consumeRateLimit(
        service,
        "signup-address",
        clientAddress,
        5,
        15 * 60,
      );
      if (!addressAllowed) {
        return json(
          { error: "Too many account creation attempts. Try again later." },
          429,
          { "Retry-After": "900" },
        );
      }

      const targetAllowed = await consumeRateLimit(
        service,
        "signup",
        `${clientAddress}|${countryId}|${instagramUsername}`,
        5,
        15 * 60,
      );
      if (!targetAllowed) {
        return json(
          { error: "Too many account creation attempts. Try again later." },
          429,
          { "Retry-After": "900" },
        );
      }
    } catch (error) {
      console.error("[country-auth] Signup rate limiting unavailable", error);
      return json({ error: "Account protection is temporarily unavailable. Try again shortly." }, 503);
    }

    const passwordError = await passwordSafetyError(password);
    if (passwordError) return json({ error: passwordError }, password.length < 6 ? 400 : 422);
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

    // Auth creation and country ownership live in different Supabase subsystems,
    // so make this flow compensating-transaction safe. The country_accounts
    // UNIQUE constraints are the authoritative race boundary: if two signups
    // pass the optimistic availability checks, only one ownership insert wins.
    const { error: ownershipError } = await service.from("country_accounts").insert({
      user_id: created.user.id,
      country_id: countryId,
      instagram_username: instagramUsername,
      display_name: displayName,
    });

    if (ownershipError) {
      const { error: cleanupError } = await service.auth.admin.deleteUser(created.user.id);
      if (cleanupError) {
        console.error(
          "[country-auth] Failed to roll back Auth user after country ownership failure",
          cleanupError,
        );
      }

      if (ownershipError.code === "23505") {
        return json(
          {
            error:
              "That country or Instagram username was claimed while your account was being created. Refresh and choose an available option.",
          },
          409,
        );
      }

      console.error("[country-auth] Country ownership creation failed", ownershipError);
      return json(
        { error: "Country ownership could not be created. No account was kept. Please try again." },
        500,
      );
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
    const identifier = String(body.identifier ?? "").trim().toLowerCase();
    try {
      const allowed = await consumeAnonymousRateLimit(
        service,
        "signin",
        clientAddress,
        identifier,
        20,
        60,
        15 * 60,
      );
      if (!allowed) {
        return json({ error: "Too many sign-in attempts. Try again later." }, 429);
      }
    } catch (error) {
      console.error("[country-auth] Sign-in rate limiting unavailable", error);
      return json({ error: "Sign-in protection is temporarily unavailable. Try again shortly." }, 503);
    }

    const resolved = await resolveLoginEmail(identifier);
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
    const identifier = String(body.identifier ?? "").trim().toLowerCase();
    try {
      const allowed = await consumeAnonymousRateLimit(
        service,
        "recover",
        clientAddress,
        identifier,
        5,
        15,
        30 * 60,
      );
      if (!allowed) {
        return json({ ok: true, recoveryAvailable: true }, 202);
      }
    } catch (error) {
      console.error("[country-auth] Recovery rate limiting unavailable", error);
      return json({ ok: true, recoveryAvailable: true }, 202);
    }

    const resolved = await resolveLoginEmail(identifier);
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

  if (action === "profile") {
    const user = await currentUser();
    if (!user) return json({ error: "Sign in again to manage your MySolaris account." }, 401);

    const { data: account, error } = await service
      .from("country_accounts")
      .select("country_id,status,instagram_username,display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !account) return json({ error: "Country account details could not be loaded." }, 403);

    const recoveryEmail = user.email && !user.email.toLowerCase().endsWith(internalEmailSuffix)
      ? user.email
      : null;

    return json({
      instagramUsername: account.instagram_username ?? null,
      displayName: account.display_name ?? null,
      email: recoveryEmail,
      hasRecoveryEmail: Boolean(recoveryEmail),
      countryId: account.country_id ?? null,
      status: account.status ?? null,
    });
  }

  if (action === "set-email") {
    const recoveryEmail = String(body.email ?? "").trim().toLowerCase();
    if (!validEmail(recoveryEmail) || recoveryEmail.endsWith(internalEmailSuffix)) {
      return json({ error: "Enter a valid email address." }, 400);
    }

    const user = await currentUser();
    if (!user) return json({ error: "Sign in again before changing your email." }, 401);

    const { data: account, error: accountError } = await service
      .from("country_accounts")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (accountError || !account) return json({ error: "Country account not found." }, 403);
    if (account.status === "suspended") return json({ error: "This country account is suspended." }, 403);

    if (user.email?.toLowerCase() === recoveryEmail) {
      return json({ ok: true, email: recoveryEmail });
    }

    const { error: updateError } = await service.auth.admin.updateUserById(user.id, {
      email: recoveryEmail,
      email_confirm: true,
      user_metadata: {
        ...(user.user_metadata ?? {}),
        has_recovery_email: true,
      },
    });

    if (updateError) {
      const message = updateError.message.toLowerCase();
      if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
        return json({ error: "That email is already used by another account." }, 409);
      }
      return json({ error: "Email could not be changed. Try again." }, 400);
    }

    return json({ ok: true, email: recoveryEmail });
  }

  if (action === "set-password") {
    const password = String(body.password ?? "");
    const passwordError = await passwordSafetyError(password);
    if (passwordError) return json({ error: passwordError }, password.length < 6 ? 400 : 422);

    const user = await currentUser();
    if (!user) return json({ error: "Your password reset session has expired. Request a new recovery link." }, 401);

    const { error: updateError } = await service.auth.admin.updateUserById(user.id, { password });
    if (updateError) return json({ error: "Password could not be changed. Try again." }, 400);
    return json({ ok: true });
  }

  return json({ error: "Unknown authentication action." }, 400);
});

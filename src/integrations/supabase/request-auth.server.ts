import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRequestHeader } from "@tanstack/react-start/server";

import type { Database } from "./types";

export type RequestAuthenticatedViewer = {
  userId: string;
  email: string | null;
  displayName: string | null;
  role: string;
  isAnonymous: boolean;
};

export type RequestAuthenticatedSupabaseContext = {
  client: SupabaseClient<Database>;
  accessToken: string;
};

type RequestAuthenticatedSupabaseOptions = {
  authorization?: string | null;
  url?: string | null;
  publishableKey?: string | null;
};

function configuredUrl(explicit?: string | null) {
  const value =
    explicit?.trim() ||
    process.env["SUPABASE_URL"]?.trim() ||
    process.env["VITE_SUPABASE_URL"]?.trim() ||
    import.meta.env.VITE_SUPABASE_URL?.trim();
  if (!value) {
    throw new Error("Solaris request-authenticated database URL is unavailable.");
  }
  return value;
}

function configuredPublishableKey(explicit?: string | null) {
  const value =
    explicit?.trim() ||
    process.env["SUPABASE_PUBLISHABLE_KEY"]?.trim() ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]?.trim() ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!value) {
    throw new Error(
      "Solaris request-authenticated publishable key is unavailable.",
    );
  }
  if (value.startsWith("sb_secret_") || value.startsWith("service_role")) {
    throw new Error(
      "Request-authenticated participant reads must never use a secret/service-role key.",
    );
  }
  return value;
}

function bearerToken(authorization: string | null | undefined) {
  const header = authorization?.trim();
  if (!header?.startsWith("Bearer ")) {
    throw new Error("Authenticated Solaris request requires a Bearer access token.");
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token || token.split(".").length !== 3) {
    throw new Error("Authenticated Solaris request contains an invalid Bearer token.");
  }
  return token;
}

function displayNameFromClaims(claims: Record<string, unknown>) {
  const metadata =
    claims.user_metadata &&
    typeof claims.user_metadata === "object" &&
    !Array.isArray(claims.user_metadata)
      ? (claims.user_metadata as Record<string, unknown>)
      : {};
  for (const key of ["display_name", "name", "instagram_username"] as const) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Creates a request-scoped Supabase client that always acts as the caller.
 *
 * This client intentionally has no service-role fallback. The publishable key
 * identifies the application while the caller JWT remains in Authorization so
 * auth.uid(), RLS and identity-bound RPCs see the real participant.
 */
export function createRequestAuthenticatedSupabaseContext(
  options: RequestAuthenticatedSupabaseOptions = {},
): RequestAuthenticatedSupabaseContext {
  const url = configuredUrl(options.url);
  const publishableKey = configuredPublishableKey(options.publishableKey);
  const authorization =
    options.authorization ?? getRequestHeader("authorization") ?? null;
  const accessToken = bearerToken(authorization);

  const client = createClient<Database>(url, publishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return { client, accessToken };
}

/**
 * Verifies the request JWT before its subject is trusted as viewer identity.
 * User metadata is presentation-only here; authorization remains RLS/capability
 * driven and must never use editable user_metadata fields.
 */
export async function verifyRequestAuthenticatedViewer(
  context: RequestAuthenticatedSupabaseContext,
  expectedUserId?: string | null,
): Promise<RequestAuthenticatedViewer> {
  const { data, error } = await context.client.auth.getClaims(context.accessToken);
  if (error || !data?.claims) {
    throw new Error("Solaris could not verify the authenticated request.");
  }

  const claims = data.claims as Record<string, unknown>;
  const userId = typeof claims.sub === "string" ? claims.sub.trim() : "";
  const role = typeof claims.role === "string" ? claims.role.trim() : "";
  if (!userId || role !== "authenticated") {
    throw new Error("Solaris request does not contain an authenticated user identity.");
  }
  if (expectedUserId?.trim() && expectedUserId.trim() !== userId) {
    throw new Error("Authenticated request viewer does not match the requested viewer scope.");
  }

  return {
    userId,
    email: typeof claims.email === "string" && claims.email.trim() ? claims.email.trim() : null,
    displayName: displayNameFromClaims(claims),
    role,
    isAnonymous: claims.is_anonymous === true,
  };
}

import { createClient, type User } from "@supabase/supabase-js";
import { getRequestHeader } from "@tanstack/react-start/server";

import type { Database } from "./types";

export type SolarisOrganizer = {
  id: string;
  email: string | null;
};

export function getSolarisPublicConfig() {
  const url =
    process.env["SUPABASE_URL"] ||
    process.env["VITE_SUPABASE_URL"] ||
    import.meta.env.VITE_SUPABASE_URL;

  const publishableKey =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Solaris authentication is not configured on this deployment.");
  }

  return { url, publishableKey };
}

export function getSolarisAccessTokenServer() {
  const authHeader = getRequestHeader("authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Not authenticated");
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) throw new Error("Not authenticated");
  return token;
}

function createSolarisAuthenticatedClientForTokenServer(token: string) {
  const { url, publishableKey } = getSolarisPublicConfig();
  return createClient<Database>(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createSolarisAuthenticatedClientServer() {
  return createSolarisAuthenticatedClientForTokenServer(getSolarisAccessTokenServer());
}

/**
 * Establishes current authenticated identity for a caller-supplied Solaris
 * bearer token. Auth.getUser proves the signed JWT identity; the subsequent
 * authenticated RPC proves that the JWT's session_id still exists in canonical
 * auth.sessions, so a signed-out/revoked but unexpired JWT cannot cross into
 * service-role server authority.
 */
export async function requireSolarisActiveUserForAccessTokenServer(token: string): Promise<User> {
  if (!token) throw new Error("Not authenticated");
  const client = createSolarisAuthenticatedClientForTokenServer(token);

  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) throw new Error("Not authenticated");

  const { data: active, error: activeError } = await (client as any).rpc(
    "v3_assert_active_session",
  );
  if (activeError || active !== true) throw new Error("Not authenticated");

  return userData.user;
}

export async function requireSolarisOrganizerServer(): Promise<SolarisOrganizer> {
  const token = getSolarisAccessTokenServer();
  const client = createSolarisAuthenticatedClientServer();
  const user = await requireSolarisActiveUserForAccessTokenServer(token);

  const now = new Date().toISOString();
  const { data: assignment, error: assignmentError } = await (client as any)
    .from("studio2_role_assignments")
    .select("role_key")
    .eq("user_id", user.id)
    .in("role_key", ["organizer", "superadmin"])
    .is("edition_id", null)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .limit(1)
    .maybeSingle();

  if (assignmentError) throw assignmentError;
  if (!assignment) throw new Error("Organizer access required");

  return {
    id: user.id,
    email: user.email ?? null,
  };
}

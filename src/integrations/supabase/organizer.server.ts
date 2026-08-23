import { createClient } from "@supabase/supabase-js";
import { getRequestHeader } from "@tanstack/react-start/server";

import type { Database } from "./types";
import { getSolarisSupabasePublishableKey, getSolarisSupabaseUrl } from "./public-config";

export type SolarisOrganizer = {
  id: string;
  email: string | null;
};

export function getSolarisPublicConfig() {
  const url = getSolarisSupabaseUrl();
  const publishableKey = getSolarisSupabasePublishableKey();

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

export function createSolarisAuthenticatedClientServer() {
  const { url, publishableKey } = getSolarisPublicConfig();
  const token = getSolarisAccessTokenServer();
  return createClient<Database>(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function requireSolarisOrganizerServer(): Promise<SolarisOrganizer> {
  const token = getSolarisAccessTokenServer();
  const client = createSolarisAuthenticatedClientServer();

  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) throw new Error("Not authenticated");

  const { data: role, error: roleError } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "organizer")
    .maybeSingle();

  if (roleError || !role) throw new Error("Organizer access required");

  return {
    id: userData.user.id,
    email: userData.user.email ?? null,
  };
}

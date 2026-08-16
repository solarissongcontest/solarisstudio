import { createClient } from "@supabase/supabase-js";
import { getRequestHeader } from "@tanstack/react-start/server";

export type SolarisOrganizer = {
  id: string;
  email: string | null;
};

function getSolarisPublicConfig() {
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

export async function requireSolarisOrganizerServer(): Promise<SolarisOrganizer> {
  const { url, publishableKey } = getSolarisPublicConfig();

  const authHeader = getRequestHeader("authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Not authenticated");

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) throw new Error("Not authenticated");

  const client = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

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

import { requireSolarisOrganizerServer } from "@/integrations/supabase/organizer.server";

export type MergedTelevotingAdmin = {
  id: string;
  username: string;
  is_super_admin: boolean;
  disabled: boolean;
  last_login_at: string | null;
  created_at: string;
};

function asSolarisAdmin(organizer: { id: string; email: string | null }): MergedTelevotingAdmin {
  return {
    id: organizer.id,
    username: organizer.email ?? "Solaris organizer",
    is_super_admin: true,
    disabled: false,
    last_login_at: null,
    created_at: new Date(0).toISOString(),
  };
}

export async function loadMergedTelevotingAdminServer() {
  try {
    const organizer = await requireSolarisOrganizerServer();
    return {
      session: null,
      admin: asSolarisAdmin(organizer),
    };
  } catch {
    return {
      session: null,
      admin: null as MergedTelevotingAdmin | null,
    };
  }
}

export async function requireMergedTelevotingAdminServer() {
  const organizer = await requireSolarisOrganizerServer();
  return asSolarisAdmin(organizer);
}

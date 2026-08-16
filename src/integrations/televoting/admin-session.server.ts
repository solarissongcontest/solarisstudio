import { requireSolarisOrganizerServer } from "@/integrations/supabase/organizer.server";

export type MergedTelevotingAdmin = {
  id: string;
  username: string;
  is_super_admin: boolean;
  disabled: boolean;
  last_login_at: string | null;
  created_at: string;
};

function asMergedAdmin(organizer: { id: string; email: string | null }): MergedTelevotingAdmin {
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
      admin: asMergedAdmin(organizer),
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
  return asMergedAdmin(organizer);
}

// Kept as compatibility exports for old route imports. Authentication now
// belongs exclusively to Solaris Studio, so there is no second username,
// password or service-specific cookie to create.
export async function loginMergedTelevotingAdminServer(_data: {
  username: string;
  password: string;
}) {
  const admin = await requireMergedTelevotingAdminServer();
  return {
    id: admin.id,
    username: admin.username,
    is_super_admin: admin.is_super_admin,
  };
}

export async function logoutMergedTelevotingAdminServer() {
  return { ok: true };
}

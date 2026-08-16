import { requireSolarisOrganizerServer } from "@/integrations/supabase/organizer.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";

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

async function asOperationalAdmin(organizer: {
  id: string;
  email: string | null;
}): Promise<MergedTelevotingAdmin> {
  // Televoting's historical audit/moderation schema has UUID columns that
  // reference the old admin_accounts table. Solaris Studio is now the sole
  // authentication authority, but privileged writes still need one valid
  // legacy UUID to satisfy those database foreign keys. Resolve that UUID
  // server-side only; the old username/password session is never consulted.
  const { data: compatibilityAdmin, error } = await televotingAdmin
    .from("admin_accounts")
    .select("id,username,is_super_admin,disabled,last_login_at,created_at")
    .eq("is_super_admin", true)
    .eq("disabled", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!compatibilityAdmin) {
    throw new Error("Televoting compatibility identity is not configured.");
  }

  return {
    id: String(compatibilityAdmin.id),
    username: organizer.email ?? "Solaris organizer",
    is_super_admin: true,
    disabled: false,
    last_login_at: compatibilityAdmin.last_login_at ?? null,
    created_at: String(compatibilityAdmin.created_at),
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
  return asOperationalAdmin(organizer);
}

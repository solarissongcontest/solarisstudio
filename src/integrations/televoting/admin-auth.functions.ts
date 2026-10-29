import { createServerFn } from "@tanstack/react-start";

export const getMergedTelevotingAdmin = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { requireSolarisCapabilityServer } = await import(
      "@/integrations/supabase/capabilities.server"
    );
    await requireSolarisCapabilityServer("voting.read", null);

    const { loadMergedTelevotingAdminServer } = await import(
      "@/integrations/televoting/admin-session.server"
    );
    const { admin } = await loadMergedTelevotingAdminServer();
    if (!admin) return null;
    return {
      id: admin.id,
      username: admin.username,
      is_super_admin: admin.is_super_admin,
      last_login_at: admin.last_login_at,
    };
  } catch {
    return null;
  }
});

import { createServerFn } from "@tanstack/react-start";

async function checkAdminBackend() {
  try {
    // Keep privileged imports inside the server handler so the service-role
    // client can never become part of a browser bundle.
    const [{ requireSolarisOrganizerServer }, { televotingAdmin }] = await Promise.all([
      import("@/integrations/supabase/organizer.server"),
      import("@/integrations/televoting/client.server"),
    ]);

    await requireSolarisOrganizerServer();

    const { error } = await televotingAdmin
      .from("admin_accounts")
      .select("id", { head: true, count: "exact" })
      .limit(1);

    return !error;
  } catch {
    return false;
  }
}

export const getMergedTelevotingServerStatus = createServerFn({ method: "GET" }).handler(
  async () => ({
    votingReady: Boolean(
      import.meta.env.VITE_TELEVOTING_SUPABASE_URL &&
        import.meta.env.VITE_TELEVOTING_SUPABASE_PUBLISHABLE_KEY,
    ),
    adminReady: await checkAdminBackend(),
  }),
);

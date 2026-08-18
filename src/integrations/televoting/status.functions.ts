import { createServerFn } from "@tanstack/react-start";

async function checkAdminBackend() {
  try {
    const [{ requireSolarisOrganizerServer }, { televotingAdmin }] = await Promise.all([
      import("@/integrations/supabase/organizer.server"),
      import("@/integrations/televoting/client.server"),
    ]);

    await requireSolarisOrganizerServer();

    const { error } = await televotingAdmin
      .from("rounds")
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
      import.meta.env.VITE_SUPABASE_URL &&
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    ),
    adminReady: await checkAdminBackend(),
  }),
);

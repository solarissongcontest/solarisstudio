import { createServerFn } from "@tanstack/react-start";

async function checkPublicBackend() {
  try {
    const { televotingPublicServer } = await import(
      "@/integrations/televoting/public.server"
    );

    // Use the same server-side public client that the ballot submission path uses.
    // A bounded HEAD read proves configuration, schema reachability and public
    // database access. Environment variables merely existing never proved any of
    // those things and could make a broken backend look healthy.
    const { error } = await televotingPublicServer
      .from("rounds")
      .select("id", { head: true, count: "exact" })
      .limit(1);

    return !error;
  } catch {
    return false;
  }
}

async function checkAdminBackend() {
  try {
    const { requireSolarisCapabilityServer } = await import(
      "@/integrations/supabase/capabilities.server"
    );
    await requireSolarisCapabilityServer("voting.read", null);

    const { televotingAdmin } = await import(
      "@/integrations/televoting/client.server"
    );

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
  async () => {
    const [votingReady, adminReady] = await Promise.all([
      checkPublicBackend(),
      checkAdminBackend(),
    ]);

    return { votingReady, adminReady };
  },
);

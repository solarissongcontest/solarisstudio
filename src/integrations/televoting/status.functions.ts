import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

async function checkAdminBridge() {
  const bridgeUrl = process.env.TELEVOTING_ADMIN_BRIDGE_URL;
  const authorization = getRequestHeader("authorization");

  if (!bridgeUrl || !authorization?.startsWith("Bearer ")) return false;

  try {
    const response = await fetch(bridgeUrl, {
      method: "GET",
      headers: {
        "x-solaris-access-token": authorization.slice("Bearer ".length).trim(),
      },
    });

    return response.ok;
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
    adminReady: await checkAdminBridge(),
  }),
);

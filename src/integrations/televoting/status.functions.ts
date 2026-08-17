import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

async function checkAdminBridge() {
  const bridgeUrl = process.env.TELEVOTING_ADMIN_BRIDGE_URL;
  const authorization = getRequestHeader("authorization");

  if (!bridgeUrl || !authorization?.startsWith("Bearer ")) return false;

  try {
    const response = await fetch(bridgeUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        "x-solaris-access-token": authorization.slice("Bearer ".length).trim(),
        Accept: "application/json",
      },
    });

    if (!response.ok || response.type === "opaqueredirect") return false;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return false;

    const payload = (await response.json()) as { ok?: boolean };
    return payload.ok === true;
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

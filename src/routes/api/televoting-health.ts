import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const TELEVOTING_URL = "https://nyzmftjbuaegmrjyypqv.supabase.co";

function authHeaders(key: string) {
  const headers = new Headers({ apikey: key, Accept: "application/json" });
  if (!key.startsWith("sb_secret_") && !key.startsWith("sb_publishable_")) {
    headers.set("Authorization", `Bearer ${key}`);
  }
  return headers;
}

async function canReadPrivateAdminTable(key: string | undefined) {
  if (!key) return false;
  try {
    const response = await fetch(
      `${TELEVOTING_URL}/rest/v1/admin_accounts?select=id&limit=1`,
      { headers: authHeaders(key) },
    );
    return response.ok;
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/televoting-health")({
  server: {
    handlers: {
      GET: async () => {
        const dedicated = process.env.TELEVOTING_SUPABASE_SERVICE_ROLE_KEY;
        const legacy = process.env.SUPABASE_SERVICE_ROLE_KEY;

        const [dedicatedWorks, legacyWorks] = await Promise.all([
          canReadPrivateAdminTable(dedicated),
          canReadPrivateAdminTable(legacy),
        ]);

        return Response.json(
          {
            dedicatedSecretPresent: Boolean(dedicated),
            dedicatedSecretWorks: dedicatedWorks,
            genericSecretPresent: Boolean(legacy),
            genericSecretWorksForTelevoting: legacyWorks,
            televotingUrlBound:
              process.env.TELEVOTING_SUPABASE_URL === TELEVOTING_URL,
          },
          {
            headers: {
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            },
          },
        );
      },
    },
  },
});

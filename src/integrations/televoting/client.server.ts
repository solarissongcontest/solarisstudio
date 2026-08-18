import { createClient } from "@supabase/supabase-js";

import type { TelevotingDatabase } from "@/integrations/televoting/database.types";
import {
  getSolarisAccessTokenServer,
  getSolarisPublicConfig,
} from "@/integrations/supabase/organizer.server";

function createTelevotingAdminClient() {
  const { url, publishableKey } = getSolarisPublicConfig();
  const token = getSolarisAccessTokenServer();

  return createClient<TelevotingDatabase, "televoting">(url, publishableKey, {
    db: { schema: "televoting" },
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export const televotingAdmin = new Proxy(
  {} as ReturnType<typeof createTelevotingAdminClient>,
  {
    get(_target, prop) {
      const client = createTelevotingAdminClient();
      const value = Reflect.get(client, prop, client);
      return typeof value === "function" ? value.bind(client) : value;
    },
  },
);

import { supabaseAdmin } from "@/integrations/supabase/client.server";

function createTelevotingAdminClient() {
  return (supabaseAdmin as any).schema("televoting");
}

let client: ReturnType<typeof createTelevotingAdminClient> | undefined;

export const televotingAdmin = new Proxy(
  {} as ReturnType<typeof createTelevotingAdminClient>,
  {
    get(_target, prop) {
      if (!client) client = createTelevotingAdminClient();
      const value = Reflect.get(client, prop, client);
      return typeof value === "function" ? value.bind(client) : value;
    },
  },
);

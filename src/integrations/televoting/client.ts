import { supabase } from "@/integrations/supabase/client";

function createTelevotingClient() {
  return (supabase as any).schema("televoting");
}

let client: ReturnType<typeof createTelevotingClient> | undefined;

export const televotingSupabase = new Proxy({} as ReturnType<typeof createTelevotingClient>, {
  get(_target, prop) {
    if (!client) client = createTelevotingClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

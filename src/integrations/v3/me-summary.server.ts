import { createSolarisAuthenticatedClientServer } from "@/integrations/supabase/organizer.server";
import { parseV3MeSummary } from "@/lib/v3-me-summary";

export async function loadV3MeSummary() {
  const client = createSolarisAuthenticatedClientServer() as unknown as { rpc(name: string): Promise<{ data: unknown; error: unknown }> };
  const { data, error } = await client.rpc("v3_me_confirmation_summary");
  if (error) throw new Error("Account summary unavailable");
  return parseV3MeSummary(data);
}

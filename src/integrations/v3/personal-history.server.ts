import { createSolarisAuthenticatedClientServer } from "@/integrations/supabase/organizer.server";
import {
  parseV3PersonalHistory,
  unavailableV3PersonalHistory,
  type V3PersonalHistoryBundle,
} from "@/lib/v3-personal-history";

type RpcError = { code?: string; message?: string };
type PersonalHistoryClient = {
  rpc(name: string): PromiseLike<{ data: unknown; error: RpcError | null }>;
};

function missingHistoryContract(error: RpcError | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "42883" ||
    error?.code === "PGRST202" ||
    message.includes("v3_my_participation_history")
  );
}

/**
 * Caller-scoped P40 history boundary. There is deliberately no user, country or
 * edition argument: auth.uid() inside the System projection owns recipient scope.
 */
export async function loadV3PersonalHistory(): Promise<V3PersonalHistoryBundle> {
  const client = createSolarisAuthenticatedClientServer() as unknown as PersonalHistoryClient;
  const { data, error } = await client.rpc("v3_my_participation_history");

  if (missingHistoryContract(error)) return unavailableV3PersonalHistory();
  if (error) throw new Error("Personal participation history unavailable");

  return parseV3PersonalHistory(data);
}

import { createSolarisAuthenticatedClientServer } from "@/integrations/supabase/organizer.server";
import {
  emptyV3ParticipationHistoryBundle,
  parseV3ParticipationHistory,
  type V3ParticipationHistoryBundle,
} from "@/lib/v3-participation-history";

type RpcError = {
  code?: string;
  message?: string;
};

type HistoryClient = {
  rpc(name: string): PromiseLike<{ data: unknown; error: RpcError | null }>;
};

function missingParticipationHistoryContract(error: RpcError | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "42883" ||
    error?.code === "PGRST202" ||
    message.includes("v3_my_participation_history")
  );
}

/**
 * Read-only adapter for SYSTEM CONTRACT REQUEST #618.
 *
 * Personal History is derived from canonical delegation/membership facts. It
 * must not be reconstructed from the currently-owned country, browser state,
 * HOD attribution preferences, or audit/internal capability records.
 */
export async function loadV3ParticipationHistory(): Promise<V3ParticipationHistoryBundle> {
  const client = createSolarisAuthenticatedClientServer() as unknown as HistoryClient;
  const { data, error } = await client.rpc("v3_my_participation_history");

  if (missingParticipationHistoryContract(error)) {
    return emptyV3ParticipationHistoryBundle();
  }
  if (error) throw new Error("Participation history unavailable");

  return parseV3ParticipationHistory(data);
}

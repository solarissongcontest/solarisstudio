import { createSolarisAuthenticatedClientServer } from "@/integrations/supabase/organizer.server";
import {
  emptyV3ParticipantActivityBundle,
  parseV3ParticipantActivity,
  type V3ParticipantActivityBundle,
} from "@/lib/v3-participant-activity";

type RpcError = {
  code?: string;
  message?: string;
};

type ActivityClient = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: RpcError | null }>;
};

function missingParticipantActivityContract(error: RpcError | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "42883" ||
    error?.code === "PGRST202" ||
    message.includes("v3_my_participant_activity")
  );
}

/**
 * Read-only adapter for the canonical System #605 recipient projection.
 *
 * Activity is derived from canonical completed operations. The missing-schema
 * fallback remains fail-closed for compatibility during staged deployment; it
 * never reconstructs private activity from alternate feeds or browser state.
 */
export async function loadV3ParticipantActivity(input: {
  before?: string | null;
  beforeOperationId?: string | null;
  limit?: number;
} = {}): Promise<V3ParticipantActivityBundle> {
  const client = createSolarisAuthenticatedClientServer() as unknown as ActivityClient;
  const { data, error } = await client.rpc("v3_my_participant_activity", {
    p_before: input.before ?? null,
    p_limit: input.limit ?? 30,
    p_before_operation_id: input.beforeOperationId ?? null,
  });

  if (missingParticipantActivityContract(error)) {
    return emptyV3ParticipantActivityBundle();
  }
  if (error) {
    throw new Error("Participant activity unavailable");
  }

  return parseV3ParticipantActivity(data);
}

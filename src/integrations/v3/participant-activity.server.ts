import { createSolarisAuthenticatedClientServer } from "@/integrations/supabase/organizer.server";
import {
  emptyV3ParticipantActivityBundle,
  parseV3ParticipantActivity,
  type V3ParticipantActivityBundle,
  type V3ParticipantActivityCursor,
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
 * Read-only adapter for SYSTEM CONTRACT REQUEST #605 / System PR #1271.
 *
 * Activity is derived from canonical participant operations. During ordered
 * rollout, a missing System projection fails closed rather than reusing
 * alternate feeds, browser history, notifications, or private infrastructure.
 */
export async function loadV3ParticipantActivity(
  cursor: V3ParticipantActivityCursor | null = null,
): Promise<V3ParticipantActivityBundle> {
  const client = createSolarisAuthenticatedClientServer() as unknown as ActivityClient;
  const { data, error } = await client.rpc("v3_my_participant_activity", {
    p_before: cursor?.before ?? null,
    p_limit: 30,
    p_before_operation_id: cursor?.operationId ?? null,
  });

  if (missingParticipantActivityContract(error)) {
    return emptyV3ParticipantActivityBundle();
  }
  if (error) {
    throw new Error("Participant activity unavailable");
  }

  return parseV3ParticipantActivity(data);
}

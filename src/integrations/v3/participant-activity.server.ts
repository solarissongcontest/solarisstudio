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
 * Read-only adapter for SYSTEM CONTRACT REQUEST #605.
 *
 * Activity is derived from canonical domain events. Until System owns the
 * recipient-scoped projection, Public V3 must fail closed rather than reuse
 * alternate feeds, browser history, or private infrastructure.
 */
export async function loadV3ParticipantActivity(): Promise<V3ParticipantActivityBundle> {
  const client = createSolarisAuthenticatedClientServer() as unknown as ActivityClient;
  const { data, error } = await client.rpc("v3_my_participant_activity", {
    p_before: null,
    p_limit: 30,
  });

  if (missingParticipantActivityContract(error)) {
    return emptyV3ParticipantActivityBundle();
  }
  if (error) {
    throw new Error("Participant activity unavailable");
  }

  return parseV3ParticipantActivity(data);
}

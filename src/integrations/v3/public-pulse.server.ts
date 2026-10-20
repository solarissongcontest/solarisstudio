import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import {
  emptyV3PulsePublicBundle,
  parseV3PulsePublicBundle,
  type V3PulseCursor,
  type V3PulsePublicBundle,
} from "@/lib/v3-pulse";
import type { PulseCategory } from "@/lib/pulse";

type RpcError = {
  code?: string;
  message?: string;
};

type PublicPulseClient = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: RpcError | null }>;
};

function missingPulseProjection(error: RpcError | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "42883" ||
    error?.code === "PGRST202" ||
    message.includes("v3_public_pulse_events")
  );
}

/**
 * Public V3 P20 reads only the caller-invariant System projection. Organizer
 * privileges deliberately cannot widen this public feed, and browser time is
 * never supplied as publication authority.
 */
export async function loadV3PublicPulse(
  cursor: V3PulseCursor | null = null,
  category: PulseCategory | null = null,
): Promise<V3PulsePublicBundle> {
  const client = createConfirmationPublicRuntimeClient() as unknown as PublicPulseClient;
  const { data, error } = await client.rpc("v3_public_pulse_events", {
    p_limit: 30,
    p_before_published_at: cursor?.publishedAt ?? null,
    p_before_id: cursor?.id ?? null,
    p_category: category,
  });

  if (missingPulseProjection(error)) return emptyV3PulsePublicBundle();
  if (error) throw new Error("Solaris Pulse is unavailable");
  return parseV3PulsePublicBundle(data);
}

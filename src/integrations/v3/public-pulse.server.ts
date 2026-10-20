import { createClient } from "@supabase/supabase-js";

import { getSolarisPublicConfig } from "@/integrations/supabase/organizer.server";
import type { Database } from "@/integrations/supabase/types";
import {
  emptyV3PublicPulseBundle,
  parseV3PublicPulseBundle,
  type V3PublicPulseBundle,
} from "@/lib/v3-public-pulse";

type RpcError = {
  code?: string;
  message?: string;
};

type PulseClient = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: RpcError | null }>;
};

function createCallerInvariantPulseClient(): PulseClient {
  const { url, publishableKey } = getSolarisPublicConfig();
  return createClient<Database>(url, publishableKey, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  }) as unknown as PulseClient;
}

function missingPublicPulseContract(error: RpcError | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "42883" ||
    error?.code === "PGRST202" ||
    message.includes("v3_public_pulse_events")
  );
}

/**
 * Caller-invariant Public Pulse boundary for System #991 / #1244.
 *
 * Deliberately use the publishable anonymous context even for an authenticated
 * Organizer-capable browser request. The System RPC is public by contract and
 * owns publication timing, payload allowlisting and route safety; viewer role
 * must never widen this feed.
 */
export async function loadV3PublicPulseEvents(): Promise<V3PublicPulseBundle> {
  const client = createCallerInvariantPulseClient();
  const { data, error } = await client.rpc("v3_public_pulse_events", {
    p_limit: 50,
    p_before_published_at: null,
    p_before_id: null,
    p_category: null,
  });

  if (missingPublicPulseContract(error)) return emptyV3PublicPulseBundle();
  if (error) throw new Error("Public Pulse unavailable");

  return parseV3PublicPulseBundle(data);
}

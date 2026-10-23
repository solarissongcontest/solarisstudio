import { supabase } from "@/integrations/supabase/client";
import type { SolarisCapability } from "@/lib/permissions-v2";
import {
  uniqueSolarisAssistantCapabilities,
  type SolarisAssistantCapabilityAccess,
  type SolarisAssistantCommand,
} from "@/lib/solaris-command-assistant";

type CapabilityRpcClient = {
  rpc(
    name: "studio2_has_capability",
    args: { p_capability: SolarisCapability; p_edition_id: string },
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

const client = supabase as unknown as CapabilityRpcClient;

function errorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "Could not verify Organizer capability access.";
}

export async function loadSolarisAssistantCapabilityAccess(
  commands: readonly SolarisAssistantCommand[],
  editionId: string,
): Promise<SolarisAssistantCapabilityAccess> {
  if (!editionId) {
    throw new Error("Command Assistant requires an exact Organizer edition before checking access.");
  }

  const capabilities = uniqueSolarisAssistantCapabilities(commands);
  const rows = await Promise.all(
    capabilities.map(async (capability) => {
      const { data, error } = await client.rpc("studio2_has_capability", {
        p_capability: capability,
        p_edition_id: editionId,
      });
      if (error) throw new Error(errorMessage(error));
      if (typeof data !== "boolean") {
        throw new Error(`Invalid capability decision for ${capability}.`);
      }
      return [capability, data] as const;
    }),
  );

  return Object.fromEntries(rows) as SolarisAssistantCapabilityAccess;
}

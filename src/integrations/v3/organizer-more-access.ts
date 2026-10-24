import { supabase } from "@/integrations/supabase/client";
import { capabilityForOrganizerPath } from "@/lib/permission-route-map";
import type { SolarisCapability } from "@/lib/permissions-v2";

export type OrganizerMoreRouteAccess = Record<string, boolean>;

export type OrganizerMoreAccessPlan = {
  pathCapabilities: Record<string, SolarisCapability>;
  capabilities: SolarisCapability[];
};

type RpcResult = PromiseLike<{ data: unknown; error: unknown }>;
export type OrganizerMoreAccessRpcClient = {
  rpc(name: string, args?: Record<string, unknown>): RpcResult;
};

const rpcClient = supabase as unknown as OrganizerMoreAccessRpcClient;

function errorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message
  ) {
    return error.message;
  }
  return "Organizer access could not be verified.";
}

export function planOrganizerMoreAccess(paths: readonly string[]): OrganizerMoreAccessPlan {
  const pathCapabilities: Record<string, SolarisCapability> = {};
  const capabilities = new Set<SolarisCapability>();

  for (const path of paths) {
    const capability = capabilityForOrganizerPath(path);
    if (!capability) continue;
    pathCapabilities[path] = capability;
    capabilities.add(capability);
  }

  return {
    pathCapabilities,
    capabilities: Array.from(capabilities).sort(),
  };
}

export async function loadOrganizerMoreRouteAccess(
  paths: readonly string[],
  editionId: string | null,
  client: OrganizerMoreAccessRpcClient = rpcClient,
): Promise<OrganizerMoreRouteAccess> {
  const plan = planOrganizerMoreAccess(paths);
  const capabilityAccess = new Map<SolarisCapability, boolean>();

  await Promise.all(
    plan.capabilities.map(async (capability) => {
      const { data, error } = await client.rpc("studio2_access_allowed", {
        p_capability: capability,
        p_edition_id: editionId,
        p_strict_before_cutover: false,
      });

      if (error) throw new Error(errorMessage(error));
      if (typeof data !== "boolean") {
        throw new Error(`Invalid access decision for ${capability}.`);
      }

      capabilityAccess.set(capability, data);
    }),
  );

  const routeAccess: OrganizerMoreRouteAccess = {};
  for (const path of paths) {
    const capability = plan.pathCapabilities[path];
    routeAccess[path] = capability ? capabilityAccess.get(capability) === true : false;
  }

  return routeAccess;
}

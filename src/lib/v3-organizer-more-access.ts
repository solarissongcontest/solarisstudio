import { createServerFn } from "@tanstack/react-start";

import { capabilityForOrganizerPath } from "@/lib/permission-route-map";
import type { SolarisCapability } from "@/lib/permissions-v2";

export type OrganizerMoreRouteAccess = Record<string, boolean>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const getOrganizerMoreCapabilities = createServerFn({ method: "POST" })
  .inputValidator((data: { editionId?: string | null }) => {
    const editionId = data?.editionId ?? null;
    if (editionId !== null && !UUID_PATTERN.test(editionId)) {
      throw new Error("Organizer More requires a valid edition context.");
    }
    return { editionId };
  })
  .handler(async ({ data }): Promise<SolarisCapability[]> => {
    const { getSolarisCapabilitiesServer } = await import(
      "@/integrations/supabase/capabilities.server"
    );
    return getSolarisCapabilitiesServer(data.editionId);
  });

export function resolveOrganizerMoreRouteAccess(
  paths: readonly string[],
  capabilities: readonly SolarisCapability[],
): OrganizerMoreRouteAccess {
  const allowed = new Set(capabilities);
  const result: OrganizerMoreRouteAccess = {};

  for (const path of paths) {
    const capability = capabilityForOrganizerPath(path);
    result[path] = capability !== null && allowed.has(capability);
  }

  return result;
}

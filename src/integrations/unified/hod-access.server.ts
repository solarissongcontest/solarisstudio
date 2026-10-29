import {
  createSolarisAuthenticatedClientServer,
  requireSolarisOrganizerServer,
} from "@/integrations/supabase/organizer.server";

export type HodHistoryCapability = "delegation.read" | "delegation.manage";

/**
 * Keep the HOD-history service-role helpers behind the same granular Permission
 * Engine boundary used by Organizer routing and table RLS.
 *
 * The authenticated request client is intentional here. `supabaseAdmin` is
 * allowed to perform the downstream cross-table work only after the caller's
 * own bearer token has proved the required capability. A lookup failure is a
 * denial; this must never fall back to the broad Organizer role.
 */
export async function requireHodHistoryCapabilityServer(
  capability: HodHistoryCapability,
  editionId: string | null = null,
) {
  await requireSolarisOrganizerServer();

  const client = createSolarisAuthenticatedClientServer() as any;
  const { data: allowed, error } = await client.rpc("studio2_access_allowed", {
    p_capability: capability,
    p_edition_id: editionId,
    p_strict_before_cutover: true,
  });

  if (error) {
    throw new Error(`Unable to verify Solaris capability: ${capability}`);
  }
  if (allowed !== true) {
    throw new Error(`Missing Solaris capability: ${capability}`);
  }
}

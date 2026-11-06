import { supabase } from "@/integrations/supabase/client";

export type OrganizerPermissionReadClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

/**
 * Public edition visibility does not imply access to private permission grants.
 * This is a read-only preflight; canonical R3 permission operations independently
 * enforce server authorization, expected-version and second-operator approval.
 */
export async function verifyOrganizerPermissionRead(
  editionId: string,
  client: OrganizerPermissionReadClient = supabase as unknown as OrganizerPermissionReadClient,
): Promise<boolean> {
  if (!editionId || !editionId.trim()) {
    throw new Error("An explicit Organizer edition is required for permission read verification.");
  }
  const { data, error } = await client.rpc("studio2_access_allowed", {
    p_capability: "permissions.read",
    p_edition_id: editionId,
    p_strict_before_cutover: false,
  });
  if (error) throw error;
  if (typeof data !== "boolean") {
    throw new Error("Permission access verification returned an invalid response.");
  }
  return data;
}

import { supabase } from "@/integrations/supabase/client";

export type OrganizerConfirmationReadClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

/**
 * Verify the same server-side Confirmation read capability used by the
 * canonical requirements RPC. A public edition row is never authority.
 * This is a read-only preflight; the requirements RPC remains authoritative.
 */
export async function verifyOrganizerConfirmationRead(
  editionId: string,
  client: OrganizerConfirmationReadClient = supabase as unknown as OrganizerConfirmationReadClient,
): Promise<boolean> {
  if (!editionId || !editionId.trim()) {
    throw new Error("An explicit Organizer edition is required to verify Confirmation access.");
  }

  const { data, error } = await client.rpc("studio2_access_allowed", {
    p_capability: "confirmation.read",
    p_edition_id: editionId,
    p_strict_before_cutover: false,
  });
  if (error) throw error;
  if (typeof data !== "boolean") {
    throw new Error("Confirmation access verification returned an invalid response.");
  }
  return data;
}

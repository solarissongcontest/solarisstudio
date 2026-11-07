import { supabase } from "@/integrations/supabase/client";
import {
  fetchWorldPublicEnabled,
  parseWorldDirectoryRows,
  type WorldOrganization,
} from "./terra-world-public";

/**
 * Me's private follow list already contains the canonical organization UUIDs.
 * Only enrich those UUIDs with currently PUBLIC names after a fresh server
 * rollout check; never substitute an old cached organization directory.
 */
export const MAX_WORLD_FOLLOWING_LOOKUP = 64;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function fetchPublishedFollowingOrganizations(
  organizationIds: readonly string[],
): Promise<WorldOrganization[]> {
  const ids = [...new Set(organizationIds)];
  if (!ids.length) return [];
  if (ids.length > MAX_WORLD_FOLLOWING_LOOKUP || ids.some((id) => !UUID.test(id))) {
    throw new Error("Institution names could not be safely resolved.");
  }
  // The gate must execute before ANY public organization query. Disabled is
  // valid: personal follow records remain manageable without public metadata.
  if (!(await fetchWorldPublicEnabled())) return [];
  const { data, error } = await (supabase as any)
    .from("world_organizations")
    .select("id,slug,official_name,short_name,type,description,status,public_visibility")
    .eq("public_visibility", "public")
    .in("status", ["recognized", "active"])
    .in("id", ids)
    .limit(ids.length);
  if (error || !Array.isArray(data)) {
    throw new Error("Institution names are temporarily unavailable.");
  }
  const knownIds = new Set(ids);
  const organizations = parseWorldDirectoryRows(data);
  // An unexpected ID is a broken scoped response, not additional public data.
  if (organizations.some((item) => !knownIds.has(item.id))) {
    throw new Error("Institution scope could not be verified.");
  }
  // Defense in depth: never display a proposed or unrecognized name even if
  // a future backend/RLS regression unexpectedly returns one.
  return organizations.filter((item) => item.status === "recognized" || item.status === "active");
}

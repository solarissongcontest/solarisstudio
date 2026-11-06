import { supabase } from "@/integrations/supabase/client";
import type { WorldMeasureManager } from "@/lib/world-measure-commands";

/** Scope and actor come from canonical TG2/TG7 data, never office-title guesses. */
export async function getWorldMeasurePermissions(measure: WorldMeasureManager): Promise<{
  canSubmit: boolean; canReview: boolean;
}> {
  const params = {
    p_organization_id: measure.organizationId,
    p_country_id: measure.sponsorCountryId,
    p_organ_id: measure.organId,
    p_object_type: null,
    p_object_id: null,
  };
  const [submit, review] = await Promise.all([
    (supabase as any).rpc("world_access_allowed", {
      ...params, p_capability: "world.measure.submit",
    }),
    (supabase as any).rpc("world_access_allowed", {
      ...params, p_capability: "world.measure.review_procedural",
    }),
  ]);
  if (submit.error || review.error ||
      typeof submit.data !== "boolean" || typeof review.data !== "boolean") {
    throw new Error("Institutional capabilities could not be verified.");
  }
  return { canSubmit: submit.data, canReview: review.data };
}

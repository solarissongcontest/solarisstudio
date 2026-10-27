import { supabase } from "@/integrations/supabase/client";

export type EditionVisualChange = {
  editionId: string;
  expected: Record<string, unknown>;
  patch: Record<string, unknown>;
  reason: string;
};

/** The server derives a stable actor-bound operation identity from the exact
 * reviewed request, so an uncertain transport retry cannot duplicate a write. */
export async function applyEditionVisualChange(input: EditionVisualChange) {
  const args = { p_edition_id: input.editionId, p_expected: input.expected, p_patch: input.patch, p_reason: input.reason };
  const client = supabase as any;
  let response = await client.rpc("v3_apply_edition_visual_change", args);
  if (response.error && !response.error.code) {
    response = await client.rpc("v3_apply_edition_visual_change", args);
  }
  if (response.error) throw response.error;
  if (response.data?.ok !== true || !response.data.edition) throw new Error("Edition visual operation has no confirmed canonical result. Reload before retrying.");
  return response.data.edition;
}

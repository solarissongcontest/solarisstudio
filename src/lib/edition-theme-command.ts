import { supabase } from "@/integrations/supabase/client";

export async function applyEditionThemeChange(input: {
  editionId: string;
  expectedThemeId: string | null;
  themeId: string | null;
  reason: string;
}) {
  const args = {
    p_edition_id: input.editionId,
    p_expected_theme_id: input.expectedThemeId,
    p_theme_id: input.themeId,
    p_reason: input.reason,
  };
  const client = supabase as any;
  let response = await client.rpc("v3_apply_edition_theme_change", args);
  if (response.error && !response.error.code) {
    response = await client.rpc("v3_apply_edition_theme_change", args);
  }
  if (response.error) throw response.error;
  if (response.data?.ok !== true || !response.data.edition || !response.data.operationId) {
    throw new Error("Edition theme operation has no confirmed canonical receipt. Reload before retrying.");
  }
  return response.data as {
    ok: true;
    operationId: string;
    replayed: boolean;
    changed: boolean;
    edition: { id: string; theme_id: string | null; data_revision: number };
  };
}

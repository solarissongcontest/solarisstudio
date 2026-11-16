import { supabase } from "@/integrations/supabase/client";

/**
 * A single, server-authoritative public-design mutation. The database validates
 * the active session, edition.manage, reviewed edition fields and revision CAS.
 * The operation fingerprint supplies an identical receipt on an exact retry.
 *
 * Artwork bytes and logos remain under the separate Media/Storage authority.
 */
export async function applyEditionPublicVisualChange(input: {
  editionId: string;
  expectedRevision: number;
  expectedName: string;
  expectedSlug: string;
  expectedThemeColors: Record<string, unknown> | null;
  nextThemeColors: Record<string, unknown>;
}): Promise<{ operationId: string; replayed: boolean; dataRevision: number }> {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
    throw new Error("Edition revision is unavailable. Reload before reviewing this change.");
  }
  const args = {
    p_edition_id: input.editionId,
    p_expected: {
      data_revision: input.expectedRevision,
      name: input.expectedName,
      slug: input.expectedSlug,
      theme_colors: input.expectedThemeColors,
    },
    p_patch: { theme_colors: input.nextThemeColors },
    p_reason: "Reviewed edition public page design",
  };
  const rpc = (supabase as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{
      data: unknown;
      error: ({ code?: string; message?: string } & Record<string, unknown>) | null;
    }>;
  }).rpc.bind(supabase);

  let response = await rpc("v3_apply_edition_visual_change", args);
  // Only retry ambiguous transport errors; SQL rejection is authoritative.
  if (response.error && !response.error.code) {
    response = await rpc("v3_apply_edition_visual_change", args);
  }
  if (response.error) throw response.error;

  const data = response.data as {
    ok?: boolean;
    replayed?: boolean;
    operationId?: string;
    edition?: { id?: string; data_revision?: number };
  } | null;
  if (data?.ok !== true ||
      typeof data.operationId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.operationId) ||
      data.edition?.id !== input.editionId ||
      !Number.isSafeInteger(data.edition?.data_revision) ||
      Number(data.edition?.data_revision) <= input.expectedRevision) {
    throw new Error("Visual design mutation has no verified canonical receipt. Reload before retrying.");
  }
  return {
    operationId: data.operationId,
    replayed: data.replayed === true,
    dataRevision: data.edition.data_revision!,
  };
}

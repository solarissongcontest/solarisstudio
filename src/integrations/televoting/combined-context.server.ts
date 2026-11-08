import { televotingAdmin } from "@/integrations/televoting/client.server";
import {
  resolveCombinedPublicationTarget,
  type CombinedPublicationTarget,
} from "@/integrations/televoting/combined-context";

export async function assertCombinedPublicationContextServer(input: {
  aggregationId: string;
  expectedEditionId?: string;
  expectedShowId?: string;
}): Promise<CombinedPublicationTarget> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const [{ data: sources, error: sourceError }, { data: bindings, error: bindingError }] =
    await Promise.all([
      televotingAdmin
        .from("televote_aggregation_sources")
        .select("source_round_id,enabled")
        .eq("aggregation_id", input.aggregationId),
      db
        .from("televoting_round_bindings")
        .select("remote_round_id,edition_id,show_id")
        .not("show_id", "is", null),
    ]);
  if (sourceError) throw new Error(sourceError.message);
  if (bindingError) throw new Error(bindingError.message);

  const showIds = [...new Set((bindings ?? []).map((binding: any) => String(binding.show_id)))];
  const { data: shows, error: showError } = showIds.length
    ? await db.from("shows").select("id,edition_id").in("id", showIds)
    : { data: [], error: null };
  if (showError) throw new Error(showError.message);

  return resolveCombinedPublicationTarget({
    sources: sources ?? [],
    bindings: bindings ?? [],
    shows: shows ?? [],
    expectedEditionId: input.expectedEditionId,
    expectedShowId: input.expectedShowId,
  });
}

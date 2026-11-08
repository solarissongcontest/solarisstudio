import { televotingAdmin } from "@/integrations/televoting/client.server";
import {
  resolveCombinedPublicationTarget,
  type CombinedPublicationTarget,
} from "@/integrations/televoting/combined-context";

export function isExpectedCombinedContextMismatch(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.message.startsWith("Combined source round ") ||
    error.message === "Enabled Combined source rounds must resolve to one Solaris edition and show" ||
    error.message === "Combined source binding does not belong to its canonical Solaris edition" ||
    error.message === "Combined result does not belong to the requested Solaris edition and show"
  );
}

export async function assertCombinedPublicationContextServer(input: {
  aggregationId: string;
  expectedEditionId?: string;
  expectedShowId?: string;
}): Promise<CombinedPublicationTarget> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const { data: sources, error: sourceError } = await televotingAdmin
    .from("televote_aggregation_sources")
    .select("source_round_id,enabled")
    .eq("aggregation_id", input.aggregationId);
  if (sourceError) throw new Error(sourceError.message);
  const sourceRoundIds = [
    ...new Set(
      (sources ?? [])
        .filter((source: any) => source.enabled && source.source_round_id)
        .map((source: any) => String(source.source_round_id)),
    ),
  ];
  const { data: bindings, error: bindingError } = sourceRoundIds.length
    ? await db
        .from("televoting_round_bindings")
        .select("remote_round_id,edition_id,show_id")
        .in("remote_round_id", sourceRoundIds)
    : { data: [], error: null };
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

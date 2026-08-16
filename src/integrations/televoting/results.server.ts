import { televotingAdmin } from "@/integrations/televoting/client.server";

export async function getMergedPublishedTelevotingResultsServer(roundId?: string) {
  const selection =
    "id,name,results_status,total_points_to_distribute,rank_exponent,calculated_at,calculation_version,public_advanced_transparency,broadcast_display_mode,editions(name)";

  let query = televotingAdmin
    .from("rounds")
    .select(selection)
    .eq("results_status", "published")
    .order("closed_at", { ascending: false })
    .limit(1);

  if (roundId) {
    query = televotingAdmin
      .from("rounds")
      .select(selection)
      .eq("results_status", "published")
      .eq("id", roundId)
      .limit(1);
  }

  const { data: rounds, error } = await query;
  if (error) throw new Error(error.message);

  const round = (rounds ?? [])[0] as unknown as {
    id: string;
    name: string;
    total_points_to_distribute: number;
    calculated_at: string | null;
    calculation_version: number;
    public_advanced_transparency: boolean | null;
    broadcast_display_mode: "original" | "converted" | "combined" | null;
    editions: { name: string } | Array<{ name: string }> | null;
  } | undefined;

  if (!round) return { round: null, rows: [] };

  const editionRelation = round.editions;
  const editionName = Array.isArray(editionRelation)
    ? editionRelation[0]?.name ?? null
    : editionRelation?.name ?? null;

  const { data: results, error: resultError } = await televotingAdmin
    .from("round_results")
    .select("*")
    .eq("round_id", round.id)
    .order("final_points", { ascending: false });
  if (resultError) throw new Error(resultError.message);

  const advanced = Boolean(round.public_advanced_transparency);
  const rows = ((results ?? []) as Array<Record<string, unknown>>).map((result) => ({
    entry_key: String(result.entry_key ?? result.country_code ?? ""),
    country_code: result.country_code ? String(result.country_code) : null,
    original_votes: Number(result.original_votes ?? 0),
    final_points: Number(result.final_points ?? 0),
    original_rank: Number(result.original_rank ?? 0),
    ...(advanced
      ? {
          rank_factor: Number(result.rank_factor ?? 0),
          weighted_score: Number(result.weighted_score ?? 0),
          exact_points: Number(result.exact_points ?? 0),
          floored_points: Number(result.floored_points ?? 0),
          decimal_remainder: Number(result.decimal_remainder ?? 0),
          remainder_bonus: Number(result.remainder_bonus ?? 0),
        }
      : {}),
  }));

  return {
    round: {
      id: round.id,
      name: round.name,
      edition: editionName,
      total_points: round.total_points_to_distribute,
      calculated_at: round.calculated_at,
      version: round.calculation_version,
      advanced,
      broadcast_mode: round.broadcast_display_mode ?? "converted",
    },
    rows,
  };
}
